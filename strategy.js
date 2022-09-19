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

        const buyAmount = processNumber(available.toString(), buy2, 'buy');
        console.log('buy2', buy2, available, buyAmount);
        placeOrder({
          side: 'buy',
          symbol: buy2,
          funds: buyAmount,
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

        const sellAmount = processNumber(available.toString(), sell, 'sell');
        console.log('sell', sell, available, sellAmount);
        placeOrder({
          side: 'sell',
          symbol: sell,
          size: sellAmount,
        });
      }),
      tap(() => {
        if (doneOrder.length !== 3 || step !== 3) {
          return;
        }

        step++;
        console.log('strategy end', currentStrategy);

        count++;
        if (count < 5) {
          oneStrategyInProgress = false;
        } else {
          console.log(count, 'times really ?');
        }

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
    exactMath.mul(pricesFlow[0], 0.998),
    pricesFlow[1],
    pricesFlow[2]
  ];

  if (oneStrategyInProgress) {
    return;
  }

  doRealStrategy(currentStrategy, realPrices);
  // doPredictedStrategy(currentStrategy, predictablePrices);
}


function doRealStrategy(currentStrategy, prices) {
  const {
    spend,
    receive,
  } = calcProfit(prices, currentStrategy);

  if (receive - spend > 0) {
    startStrategy(currentStrategy);
  }
}


function makeCalculation() {
  if (oneStrategyInProgress) {
    return;
  }

  //startStrategy([ 'TRX-USDT', 'WIN-TRX', 'WIN-USDT' ]);

  strategies.forEach(checkStrategy);
}

module.exports = {
  makeCalculation,
};
