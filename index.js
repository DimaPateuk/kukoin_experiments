require('dotenv').config()
const kucoin = require('./kucoin')
const { v4 } = require('uuid')
const exactMath = require('exact-math')
const strategies = require('./pairs');
const {
  pipe,
  Subject,
  filter,
  switchMap,
  switchMapTo,
  tap,
  take,
  map,
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


function waitBlanceUpdateAfterOrder(currency, contextSymbol) {
    return switchMap((beforeBalanceEvent) => {

      return balansesSubject
        .pipe(
          filter(balanceEvent => {
            console.log(balanceEvent);
            return balanceEvent.currency === currency &&
              balanceEvent.relationContext.symbol === contextSymbol &&
              balanceEvent.relationContext.orderId === beforeBalanceEvent.orderId;
          }),
          take(1),
          map((balanceEvent) => {
            return [beforeBalanceEvent, balanceEvent];
          }),
        );
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
    funds: '2',
  });

  return ordersSubject.pipe(
    waitBlanceUpdateAfterOrder(buy.split('-')[0], buy),
    tap(([buyData]) => {
      console.log('manage buy done');
      strategyData.push(buyData);

      placeOrder({
        side: 'buy',
        symbol: buy2,
        funds: buyData.filledSize.substring(
          0,
          symbolsInfo[buy2].minFunds.length
        ),
      });
    }),
    switchMapTo(ordersSubject),
    waitBlanceUpdateAfterOrder(buy2.split('-')[0], buy2),
    tap(([buy2Data]) => {
      strategyData.push(buy2Data);
      console.log('manage buy2 done');

      placeOrder({
        side: 'sell',
        symbol: sell,
        size: buy2Data.filledSize.substring(
          0,
          symbolsInfo[sell].baseMinSize.length
        ),
      })
    }),
    switchMapTo(ordersSubject),
    waitBlanceUpdateAfterOrder(sell.split('-')[1], sell),
    tap(([sellData, balanceEvent]) => {
      strategyData.push(sellData);
      const [buy, buy2, sell] = strategyData;
      console.log('manage sell done');

      console.log('---+++');
      console.log(currentStrategy);
      console.log(strategyData.length);
      console.log(balanceEvent);
      console.log('---+++');

      // oneStrategyInProgress = false;
    }),
    take(1)
  )
  .subscribe();
}

// setTimeout(() => {
//   startStratgy([ 'BTC-USDT', 'PUNDIX-BTC', 'PUNDIX-USDT' ]);
// }, 5000);

kucoin.initSocket({ topic: "allTicker" }, (msg) => {
  const parsedMessage = JSON.parse(msg);

  subjectsMap[parsedMessage.subject] = parsedMessage.data;

  makeCalculation();

});

kucoin.initSocket({ topic: "orders" }, (msg) => {
  const parsedMessage = JSON.parse(msg);

  if (parsedMessage.topic !== "/spotMarket/tradeOrders") {
    return;
  }

  const { data } = parsedMessage;

  if (data.status === 'done') {
    ordersSubject.next(data);
  }
});

kucoin.initSocket({ topic: "balances" }, (msg) => {
  const parsedMessage = JSON.parse(msg);

  if (parsedMessage.topic !== "/account/balance") {
    return;
  }

  const { data } = parsedMessage;
  balansesSubject.next(data);
});

// test !!!
// setTimeout(() => {

//   const test = [ 'BTC-USDT', 'XLM-BTC', 'XLM-USDT' ];

//   startStratgy(test);
// }, 5000);


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

      const MYbaseFee = 0;
      const spend = prices[0];
      const spend2 = exactMath.div(1 - MYbaseFee, exactMath.mul(prices[1],  1 + MYbaseFee));
      const receive = exactMath.mul(exactMath.mul(spend2, 1 - MYbaseFee), prices[2]);

      if (receive - spend < 0) {
        console.log(currentStrategy);
        delete info[strategyName]
        return;
      }

      startStratgy(currentStrategy, info[strategyName]);
    });
}

