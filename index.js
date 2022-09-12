require('dotenv').config()
const kucoin = require('./kucoin')
const { v4 } = require('uuid')
const exactMath = require('exact-math')
const strategies = require('./pairs');
const { Subject, from, filter, switchMap, switchMapTo, tap, take } = require('rxjs')

kucoin.init({
  apiKey: process.env.apiKey,
  secretKey: process.env.secretKey,
  passphrase: process.env.passphrase,
  environment: 'live'
});

const subjectsMap = {};

const ordersSubject = new Subject();
const strategiesSubject = new Subject();

function placeOrder(params) {
  return kucoin.placeOrder({
    type: 'market',
    ...params
  });
}

function filterOrder(symbol, side) {
    return filter(event => {
      if (event.side !== side) {
        return;
      }

      return event.symbol === buy;
    });
}

let oneStrategyInProgress = false;

function startStratgy(currentStrateg, potentialProfitInfo) {


  if (oneStrategyInProgress) {
    console.log('skip');
    console.log(JSON.stringify(potentialProfitInfo, null, 4));
    console.log('------');
    return;
  }
  const currentStrategy = [buy, buy2, sell];

  oneStrategyInProgress = true;

  const strategyData = [];

  return from(
    placeOrder({
      side: 'buy',
      symbol: buy,
      funds: '1',
    })
  ).pipe(
    switchMapTo(ordersSubject),
    filterOrder(buy, 'buy'),
    switchMap((buyData) => {
      strategyData.push(buyData);
      return from(
        placeOrder({
          side: 'buy',
          symbol: buy2,
          funds: buyData.filledSize,
        })
      );
    }),
    switchMapTo(ordersSubject),
    filterOrder(buy2, 'buy'),
    switchMap((buy2Data) => {
      strategyData.push(buy2Data);

      return from(
        placeOrder({
          side: 'sell',
          symbol: buy2,
          size: buy2Data.filledSize,
        })
      );
    }),
    switchMapTo(ordersSubject),
    filterOrder(sell, 'sell'),
    tap(sellData => {
      strategyData.push(sellData);
      const [buy, buy2, sell] = strategyData;

      console.log('---+++');
      console.log(currentStrategy)
      console.log('final', sell.filledSize);
      console.log('---+++');

      oneStrategyInProgress = false;
      strategiesSubject.next({ strategy: currentStrateg, type: 'end' })
    }),
    take(1)
  )
  .subscribe();
}

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

const info = {};

function makeCalculation() {
  const strategiesArray = Object.keys(strategies);

  strategiesArray
    .forEach((strategyName) => {
      const currentStrategy = strategies[strategyName];
      const [buy, buy2, sell] = currentStrategy;

      if(!buy.split('-')[1] !== 'USDT') {
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

      strategiesSubject.next({ strategy: currentStrategy, type: 'start' });
      info[strategyName] = {
        strategyName,
        prices,
        final: receive - spend
      };
      startStratgy(currentStrategy, info[strategyName]);
    });

}

function logPotentialProfit() {
  const entries = Object
    .entries(info)

  console.clear();
  entries
    .forEach(([key, value]) => {
      console.log('-----');
      console.log(key);
      console.log(value.prices);
      console.log(value.final);
    });
}
