const { placeOrder, placeOrderErrorSubject } = require('./placeOrder');
const {
  takeUntil,
  tap,
  merge,
  Subject,
} = require('rxjs');
const { processNumber } = require('./processNumber');
const {
  balancesSubject,
  strategies,
  ordersSubject,
} = require('./resources');
const { calcProfit } = require('./calcProfit');
const { v4 } = require('uuid');
const { priceDiff } = require('./priceDiff');

let count = 0;
const maxStrategyTries = 10;
const maxStrategiesInParallel = 1;
const strategiesInProgress = new Map();
const executedStrategies = [];

function shouldWait(currentStrategy) {
  if (count >= maxStrategyTries) {
    return true;
  }

  if(strategiesInProgress.has(currentStrategy.join())) {
    return true;
  }

  return strategiesInProgress.size >= maxStrategiesInParallel;
}


function startStrategy(currentStrategy, profitInfo) {
  if (shouldWait(currentStrategy)) {
    return;
  }
  count++;
  strategiesInProgress.set(currentStrategy.join(), currentStrategy);

  const [buy, buy2, sell] = currentStrategy;
  const ordersClientIds = Array(3).fill(0).map(() => {
    return `${v4()}`;
  });
  const [clientOidBuy, clientOidBuy2, clientOidSell] = ordersClientIds;

  console.log(currentStrategy, '---- started');
  console.log(currentStrategy, '----', ordersClientIds);
  console.log(JSON.stringify(profitInfo, null, 4));
  console.log(currentStrategy, '----');


  const doneOrder = [];
  const availableMap = {};
  let step = 1;
  const ordersDoneSubject = new Subject();
  const strategyEndSubject = new Subject();

  ordersSubject
    .pipe(
      tap((data) => {
        if (!ordersClientIds.includes(data.clientOid)) {
          return;
        }

        if (data.status === 'done') {
          ordersDoneSubject.next({ order: data });
        }

        if (!data.matchPrice) {
          return;
        }

        const { symbol, matchPrice } = data;
        const floatMathPrice = parseFloat(matchPrice);
        const stepIndex = currentStrategy.indexOf(symbol);

        console.log('--------', symbol);

        if (stepIndex == 2) {
          console.log(symbol, floatMathPrice >= profitInfo.fakePrices[stepIndex], priceDiff(floatMathPrice, profitInfo.fakePrices[stepIndex]));
        } else {
          console.log(symbol, floatMathPrice <= profitInfo.fakePrices[stepIndex], priceDiff(floatMathPrice, profitInfo.fakePrices[stepIndex]));
        }
        console.log('--------');

      }),
      takeUntil(
        merge(
          placeOrderErrorSubject,
          strategyEndSubject
        )
      )
    ).subscribe();


  placeOrder({
    clientOid: clientOidBuy,
    side: 'buy',
    symbol: buy,
    // price: profitInfo.stringPrices[0].toString(),
    size: processNumber((profitInfo.buyCoins).toString(), buy, 'asks'),
  });

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

        const buyAmount = processNumber((filledSize).toString(), buy2, 'asks', true);
        console.log('buy2 !!!!!!', buy2, filledSize, buyAmount);

        placeOrder({
          clientOid: clientOidBuy2,
          side: 'buy',
          symbol: buy2,
          // price: profitInfo.stringPrices[1].toString(),
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

        const sellAmount = processNumber((filledSize).toString(), sell, 'bids');
        console.log('sell !!!!!', sell, filledSize, sellAmount, 'available', available);

        placeOrder({
          clientOid: clientOidSell,
          side: 'sell',
          symbol: sell,
          //price: profitInfo.stringPrices[2].toString(),
          size: sellAmount,
        });

      }),
      tap(() => {
        if (doneOrder.length !== 3 || step !== 3) {
          return;
        }

        step++;
        console.log(count - strategiesInProgress.size, 'strategy end', currentStrategy);
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
          strategyEndSubject
            .pipe(
              tap(() => {
                executedStrategies.push({
                  currentStrategy,
                  profitInfo,
                });
                setTimeout(() => {
                  strategiesInProgress.delete(currentStrategy.join());

                  if (count >= maxStrategyTries && strategiesInProgress.size === 0) {
                    console.log(count, 'times really ?');
                    console.log(JSON.stringify(executedStrategies, null, 4));
                  }
                }, 5000);
              })
            )
        )
      ),
    )
    .subscribe();
}

function checkStrategy (currentStrategy, index) {
  for(let i = 10; i >= 0; i--) {
    doRealStrategy(currentStrategy, i, index);
  }
}

function doRealStrategy(currentStrategy, orderBookDepth, index) {
  const profitInfo = calcProfit(currentStrategy, orderBookDepth);

  if (!profitInfo.strategy) {
    return;
  }

  if (profitInfo.profit > 0) {
    startStrategy(currentStrategy, profitInfo);
  }
}

function makeCalculation() {
  strategies.forEach(checkStrategy);
}

module.exports = {
  makeCalculation,
};
