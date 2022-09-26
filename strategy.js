const { placeOrder, placeOrderErrorSubject } = require('./placeOrder');
const {
  takeUntil,
  tap,
  merge,
} = require('rxjs');
const { processNumber } = require('./processNumber');
const {
  ordersDoneSubject,
  balancesSubject,
  strategies,
  baseFirstStepAmount,
  socketCloseSubject,
  strategyEndSubject,
  ordersSubject,
  symbolsOrderBookInfoMap,
} = require('./resources');
const { calcProfit } = require('./calcProfit');


const maxTries = 1;
let oneStrategyInProgress = false;
let count = 0;

function startStrategy(currentStrategy, profitInfo) {
  if (oneStrategyInProgress) {
    return;
  }

  oneStrategyInProgress = true;


  const [buy, buy2, sell] = currentStrategy;

  console.log(currentStrategy, '---- started');
  console.log(currentStrategy, '----');
  console.log(JSON.stringify(profitInfo, null, 4));
  console.log(currentStrategy, '----');

  placeOrder({
    side: 'buy',
    symbol: buy,
    size: baseFirstStepAmount.toString(),
  });

  const doneOrder = [];
  const availableMap = {};
  let step = 1;

  ordersSubject
    .pipe(
      tap((data) => {
        if (!data.matchPrice) {
          return;
        }

        const { symbol, matchPrice, matchSize } = data;
        const floatMathPrice = parseFloat(matchPrice);
        const floatMathSize = parseFloat(matchSize);
        const bestAsk = parseFloat(symbolsOrderBookInfoMap[symbol].asks[0][0]);
        const bestBid = parseFloat(symbolsOrderBookInfoMap[symbol].bids[0][0]);
        const stepIndex = currentStrategy.indexOf(symbol);

        console.log('matchPrice', symbol, floatMathPrice, floatMathSize);
        if (stepIndex === 2) {
          console.log('diff Bids', floatMathPrice >= bestBid, bestBid, floatMathPrice / bestBid, floatMathPrice - bestBid);
        } else {
          console.log('diff Ask', floatMathPrice <= bestAsk, bestAsk, floatMathPrice / bestAsk, floatMathPrice - bestAsk);
        }

        console.log('--------');
      }),
      takeUntil(
        merge(
          placeOrderErrorSubject,
          socketCloseSubject,
          strategyEndSubject
        )
      )
    ).subscribe();

  merge(ordersDoneSubject, balancesSubject)
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
          size: buyAmount,
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
        strategyEndSubject.next({currentStrategy});
      }),
      takeUntil(
        merge(
          placeOrderErrorSubject
            .pipe(
              tap((e) => {
                console.log('some error with order', JSON.stringify(e, null, 4));
              })
            ),
          socketCloseSubject
            .pipe(
              tap(() => {
                console.log('By some reason strategy was in progress while socket was closed.');
                if (count < maxTries) {
                  oneStrategyInProgress = false;
                }
              })
            ),
          strategyEndSubject
            .pipe(
              tap(() => {
                count++;
                if (count < maxTries) {
                  oneStrategyInProgress = false;
                } else {
                  console.log(count, 'times really ?');
                }
              })
            )
        )
      ),
    )
    .subscribe();
}

function checkStrategy (currentStrategy) {

  if (oneStrategyInProgress) {
    return;
  }


  doRealStrategy(currentStrategy, 4);
  doRealStrategy(currentStrategy, 3);
  doRealStrategy(currentStrategy, 2);
  doRealStrategy(currentStrategy, 1);
  doRealStrategy(currentStrategy, 0);
}
let countCalc = 0;
function doRealStrategy(currentStrategy, orderBookDepth) {
  const profitInfo = calcProfit(currentStrategy, orderBookDepth);
  const {
    spend,
    receive,
  } = profitInfo;

  if (receive / spend > 1.001) {
    if (orderBookDepth > -1) {
      startStrategy(currentStrategy, profitInfo);
    }
  }
}

function makeCalculation() {
  if (oneStrategyInProgress) {
    return;
  }

  // doRealStrategy([ 'TRX-USDT', 'WIN-TRX', 'WIN-USDT' ], 0);

  strategies.forEach(checkStrategy);
}



module.exports = {
  makeCalculation,
};
