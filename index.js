require('dotenv').config()
const kucoin = require('./kucoin')
const { v4 } = require('uuid')
const exactMath = require('exact-math')
const strategies = require('./pairs');
const {
  takeWhile,
  Subject,
  filter,
  switchMap,
  tap,
  take,
  map,
  of,
  last,
  merge,
  delay,
} = require('rxjs')

kucoin.init({
  apiKey: process.env.apiKey,
  secretKey: process.env.secretKey,
  passphrase: process.env.passphrase,
  environment: 'live'
});

const symbolsInfo = {};

kucoin.getSymbols()
  .then(response => {

    response
      .data
      .forEach(item => {
        symbolsInfo[item.symbol] = item;
      });
  });

const subjectsMap = {};
const ordersSubject = new Subject();
const balansesSubject = new Subject();

balansesSubject
  .subscribe(({balance}) => {
    if (balance.currency !== 'USDT') {
      return;
    }

    console.log(balance.available);
  });

function placeOrder(params) {

  return kucoin.placeOrder({
      clientOid: v4(),
      type: 'market',
      ...params
    })
    .then((res) => {
      return res;

    }, (err) => {
      console.log(err);
    });
}

let oneStrategyInProgress = false;

function startStratgy(currentStrategy, potentialProfitInfo) {
  oneStrategyInProgress = true;

  const [buy, buy2, sell] = currentStrategy;

  const strategyData = [];

  console.log(currentStrategy, '---- started');

  placeOrder({
    side: 'buy',
    symbol: buy,
    funds: '1',
  });

  const doneOrder = [];
  const availableMap = {};
  let step = 1;
  return merge(ordersSubject, balansesSubject)
    .pipe(
      delay(500),
      tap(event => {
        if (event.order) {
          doneOrder.push(event.order);
        }

        if (event.balance) {
          availableMap[event.balance.currency] = parseFloat(event.balance.available);
        }
      }),
      tap(() => {
        if (doneOrder.length !== 1 || step !== 1) {
          return;
        }

        const order = doneOrder[0];
        const filledSize = parseFloat(order.filledSize);
        const currency = order.symbol.split('-')[1];
        const available = availableMap[currency];

        if (!available) {
          return;
        }

        if (filledSize >= available) {
          return;
        }

        step++;

        placeOrder({
          side: 'buy',
          symbol: buy2,
          funds: order.filledSize.substring(
            0,
            symbolsInfo[buy2].minFunds.length
          ),
        });
      }),
      tap(() => {
        if (doneOrder.length !== 2 || step !== 2) {
          return;
        }

        const order = doneOrder[1];
        const filledSize = parseFloat(order.filledSize);
        const currency = order.symbol.split('-')[0];
        const available = availableMap[currency];

        if (!available) {
          return;
        }

        if (filledSize >= available) {
          return;
        }

        step++;

        placeOrder({
          side: 'sell',
          symbol: sell,
          size: order.filledSize.substring(
            0,
            symbolsInfo[sell].baseMinSize.length
          ),
        });
      }),
      tap(() => {
        if (doneOrder.length !== 3 || step !== 3) {

          return;
        }
        step++;
        console.log('strategy end', currentStrategy);
      }),
      takeWhile(() => {
        return step < 4;
      }),
    )
    .subscribe();
}

kucoin.initSocket({ topic: "allTicker" }, (msg) => {
  const parsedMessage = JSON.parse(msg);

  subjectsMap[parsedMessage.subject] = parsedMessage.data;

  makeCalculation();

}, () => {

  Object
    .keys(subjectsMap)
    .forEach(key => {
      delete subjectsMap[key];
    });
  console.log(key);

});

kucoin.initSocket({ topic: "orders" }, (msg) => {
  const parsedMessage = JSON.parse(msg);

  if (parsedMessage.topic !== "/spotMarket/tradeOrders") {
    return;
  }

  const { data } = parsedMessage;

  if (data.status === 'done') {
    ordersSubject.next({ order: data });
  }
});

kucoin.initSocket({ topic: "balances" }, (msg) => {
  const parsedMessage = JSON.parse(msg);

  if (parsedMessage.topic !== "/account/balance") {
    return;
  }

  const { data } = parsedMessage;
  balansesSubject.next({ balance: data });
});

const info = {};

function makeCalculation() {
  const strategiesArray = Object.keys(strategies);

  strategiesArray
    .forEach((strategyName) => {
      const currentStrategy = strategies[strategyName];
      const [buy, buy2, sell] = currentStrategy;

      if(buy.split('-')[1] !== 'USDT') {
        return;
      }

      if (oneStrategyInProgress) {
        return;
      }

      if (
        !subjectsMap[buy]?.bestBid ||
        !subjectsMap[buy2]?.bestBid ||
        !subjectsMap[sell]?.bestAsk
      ) {
        return;
      }
      const pricesFlow = [
        subjectsMap[buy].bestAsk,
        subjectsMap[buy2].bestAsk,
        subjectsMap[sell].bestBid
      ].map(num => parseFloat(num));

      const prices = [
        pricesFlow[0],
        pricesFlow[1],
        pricesFlow[2]
      ];

      const MYbaseFee = 0.01;
      const spend = prices[0];
      const spend2 = exactMath.div(1 - MYbaseFee, exactMath.mul(prices[1],  1 + MYbaseFee));
      const receive = exactMath.mul(exactMath.mul(spend2, 1 - MYbaseFee), prices[2]);

      if (receive - spend < 0) {
        delete info[strategyName]
        return;
      }

      startStratgy(currentStrategy, info[strategyName]);
    });
}

