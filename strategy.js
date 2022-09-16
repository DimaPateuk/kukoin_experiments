const exactMath = require('exact-math');
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
  balancesSubject,
  MYbaseFee,
  strategies,
} = require('./resources');
const { calcProfit } = require('./calcProfit');


let oneStrategyInProgress = null;
let count = 0;

function startStrategy(currentStrategy) {
  oneStrategyInProgress = currentStrategy;

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


function checkStrategy (currentStrategy) {
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

  const realPrices = [
    pricesFlow[0],
    pricesFlow[1],
    pricesFlow[2]
  ];

  const predictablePrices = [
    exactMath.mul(pricesFlow[0], 0.995),
    pricesFlow[1],
    pricesFlow[2]
  ];

  if (oneStrategyInProgress) {
    return;
  }

  doStrategy(currentStrategy, realPrices, 'real');
  doStrategy(currentStrategy, predictablePrices, 'predict');
}

function doStrategy(currentStrategy, prices, description) {
  const {
    spend,
    spend2,
    receive,
  } = calcProfit(prices, MYbaseFee);

  console.log('---', description);
  console.log(prices);
  console.log(currentStrategy, receive - spend);
  if (receive - spend > 0) {
    oneStrategyInProgress = currentStrategy;
  }
}


function makeCalculation() {
  if (oneStrategyInProgress) {
    return;
  }

  strategies.forEach(checkStrategy);
}
// implement profitable strategies

module.exports = {
  makeCalculation,
};
