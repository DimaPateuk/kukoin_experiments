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


const maxTries = 10;
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
    price: profitInfo.stringPrices[0].toString(),
    size: processNumber((profitInfo.buyCoins).toString(), buy, 'buy'),
  });

  const doneOrder = [];
  const availableMap = {};
  let step = 1;

  ordersSubject
    .pipe(
      tap((data) => {
        console.log(data);

        if (!data.matchPrice) {
          return;
        }

        const { symbol, matchPrice, matchSize } = data;
        const floatMathPrice = parseFloat(matchPrice);
        const floatMathSize = parseFloat(matchSize);
        const bestAsk = parseFloat(symbolsOrderBookInfoMap[symbol].asks[0][0]);
        const bestBid = parseFloat(symbolsOrderBookInfoMap[symbol].bids[0][0]);
        const stepIndex = currentStrategy.indexOf(symbol);

        console.log('--------', symbol);
        console.log(symbol, 'matchPrice', floatMathPrice, 'mathSize', floatMathSize);
        console.log(symbol, 'required price', profitInfo.stringPrices[stepIndex], 'required size', profitInfo.sizes[stepIndex]);
        console.log(symbol, 'bestAsk', bestAsk, 'bestBid', bestBid);

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

        const buyAmount = processNumber((profitInfo.buy2Coins).toString(), buy2, 'buy');
        console.log('buy2', buy2, available, buyAmount);

        placeOrder({
          side: 'buy',
          symbol: buy2,
          price: profitInfo.stringPrices[1].toString(),
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

        const sellAmount = processNumber((available).toString(), sell, 'sell');
        console.log('sell', sell, available, sellAmount);

        placeOrder({
          side: 'sell',
          symbol: sell,
          price: profitInfo.stringPrices[2].toString(),
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

  // for(let i = 20; i >= 3; i--) {
  //   doRealStrategy(currentStrategy, i);
  // }
    doRealStrategy(currentStrategy, 2);
    doRealStrategy(currentStrategy, 1);
    doRealStrategy(currentStrategy, 0);

}

function doRealStrategy(currentStrategy, orderBookDepth) {
  if (oneStrategyInProgress) {
    return;
  }
  const profitInfo = calcProfit(currentStrategy, orderBookDepth);
  const {
    spend,
    receive,
  } = profitInfo;


  // console.log(profitInfo.strategy, receive - spend);

  if (receive - spend > 0) {

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
