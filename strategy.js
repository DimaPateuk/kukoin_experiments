const exactMath = require('exact-math');
const { placeOrder, placeOrderErrorSubject } = require('./placeOrder');
const {
  takeUntil,
  tap,
  merge,
} = require('rxjs');
const { processNumber } = require('./processNumber');
const {
  ordersSubject,
  symbolsOrderBookInfoMap,
  balancesSubject,
  strategies,
  baseFirstStepAmount,
  socketCloseSubject,
  strategyEndSubject,
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
    funds: baseFirstStepAmount.toString(),
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
                if (count < 3) {
                  oneStrategyInProgress = false;
                }
              })
            ),
          strategyEndSubject
            .pipe(
              tap(() => {
                count++;
                if (count < 3) {
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

function doRealStrategy(currentStrategy, orderBookDepth) {
  const {
    spend,
    receive,
    prices,
  } = calcProfit(currentStrategy, orderBookDepth);

  if (receive > spend) {
    console.log(orderBookDepth, currentStrategy, prices, receive - spend);
    //startStrategy(currentStrategy);
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
