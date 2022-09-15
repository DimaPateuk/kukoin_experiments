const exactMath = require('exact-math');
const strategies = require('./pairs');
const { placeOrder } = require('./placeOrder');
const {
  takeWhile,
  tap,
  merge,
} = require('rxjs');
const { processNumber } = require('./processNumber');
const {
  ordersSubject,
  symbolsOrderBookInfoMap,
  balancesSubject
} = require('./resources');

const MYbaseFee = 0.01;
let oneStrategyInProgress = false;
let count = 0;

function startStrategy(currentStrategy) {
  oneStrategyInProgress = true;

  const [buy, buy2, sell] = currentStrategy;

  console.log(currentStrategy, '---- started');

  placeOrder({
    side: 'buy',
    symbol: buy,
    funds: '1',
  });

  const doneOrder = [];
  const availableMap = {};
  let step = 1;

  merge(ordersSubject, balancesSubject)
    .pipe(
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
        const currency = order.symbol.split('-')[0];
        const available = availableMap[currency];

        if (!available) {
          return;
        }

        if (filledSize > available) {
          return;
        }

        step++;

        console.log('price', order.price);
        console.log('buy2', processNumber(order.filledSize, buy2, 'buy'));
        placeOrder({
          side: 'buy',
          symbol: buy2,
          funds: processNumber(order.filledSize, buy2, 'buy'),
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

        if (filledSize > available) {
          return;
        }

        step++;

        console.log('price', order.price);
        console.log('sell', processNumber(order.filledSize, sell, 'sell'));
        placeOrder({
          side: 'sell',
          symbol: sell,
          size: processNumber(order.filledSize, sell, 'sell'),
        });
      }),
      tap(() => {
        if (doneOrder.length !== 3 || step !== 3) {
          return;
        }

        console.log('price', doneOrder[2].price);
        step++;
        console.log('strategy end', currentStrategy);

        // count++;
        // if (count < 5) {
        //   oneStrategyInProgress = false;
        // }

      }),
      takeWhile(() => {
        return step < 4;
      }),
    )
    .subscribe();
}

function makeCalculation() {
  if (oneStrategyInProgress) {
    return;
  }

  startStrategy([ 'BTC-USDT', 'PEEL-BTC', 'PEEL-USDT' ]);

  return;
  const strategiesArray = Object.keys(strategies);

  strategiesArray
    .forEach((strategyName) => {
      const currentStrategy = strategies[strategyName];
      const [buy, buy2, sell] = currentStrategy;

      if (
        !symbolsOrderBookInfoMap[buy]?.bestBid ||
        !symbolsOrderBookInfoMap[buy2]?.bestBid ||
        !symbolsOrderBookInfoMap[sell]?.bestAsk
      ) {
        return;
      }
      const pricesFlow = [
        symbolsOrderBookInfoMap[buy].bestAsk,
        symbolsOrderBookInfoMap[buy2].bestAsk,
        symbolsOrderBookInfoMap[sell].bestBid
      ].map(num => parseFloat(num));

      const prices = [
        pricesFlow[0],
        pricesFlow[1],
        pricesFlow[2]
      ];

      const spend = prices[0];
      const spend2 = exactMath.div(1 - MYbaseFee, exactMath.mul(prices[1], 1 + MYbaseFee));
      const receive = exactMath.mul(exactMath.mul(spend2, 1 - MYbaseFee), prices[2]);

      if (receive - spend < 0) {
        return;
      }

      console.log(prices);
      if(buy.split('-')[1] !== 'USDT') {
        console.log(currentStrategy);
        console.log('----');
        return;
      }

      if (oneStrategyInProgress) {
        return;
      }

      //startStrategy(currentStrategy);
    });
}

module.exports = {
  makeCalculation,
};
