const { placeOrder, placeOrderErrorSubject } = require('./placeOrder');
const {
  takeUntil,
  tap,
  merge,
  Subject,
  interval,
} = require('rxjs');
const { processNumber } = require('./processNumber');
const {
  balancesSubject,
  strategies,
  ordersSubject,
  symbolsOrderBookInfoMap,
} = require('./resources');
const { calcProfit } = require('./calcProfit');
const { v4 } = require('uuid');
const { priceDiff } = require('./priceDiff');
const kucoin = require('./kucoin');

let count = 0;
const maxStrategyTries = 1;
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
  //console.log(JSON.stringify(profitInfo, null, 4));

  const doneOrders = [];
  const openOrdersResponses = [];
  const availableMap = {};
  let step = 1;
  const ordersDoneSubject = new Subject();
  const strategyEndSubject = new Subject();

  interval(10)
    .pipe(
      tap(() => {
        if (openOrdersResponses.length !== 1) {
          return;
        }

        const order = openOrdersResponses[0];
        const fee = profitInfo.fees[0];
        const currentPrice = parseFloat(symbolsOrderBookInfoMap[buy].asks[0][0]);
        const requiredPrice = profitInfo.fakePrices[0];
        console.log('-----', buy, currentStrategy);
        console.log(openOrdersResponses);
        console.log(order);
        console.log(symbolsOrderBookInfoMap[buy].asks[0]);
        console.log(currentPrice, requiredPrice);
        console.log(currentPrice / requiredPrice, 1 + fee);

        if (currentPrice / requiredPrice < 1 + fee) {
          return;
        }

        console.log(currentStrategy, 'remove BEFORE first step');
        strategyEndSubject.next();
        kucoin.cancelOrder({ id: order.orderId })
          .catch((e) => {
            console.log(e, 'error on the canceling first step of the strategy', currentStrategy);
          });

      }),

      tap(() => {

        if (openOrdersResponses.length !== 2) {
          return;
        }

        const order = openOrdersResponses[1];
        const fee = profitInfo.fees[1];
        const doneOrder = doneOrders[0];
        const currentPrice = parseFloat(symbolsOrderBookInfoMap[order.symbol].asks[0][0]);
        const requiredPrice = profitInfo.fakePrices[0];
        console.log('-----', buy2, currentStrategy);
        console.log(openOrdersResponses);
        console.log(order);
        console.log(symbolsOrderBookInfoMap[order.symbol].asks[0]);
        console.log(currentPrice, requiredPrice);
        console.log(currentPrice / requiredPrice, 1 + fee);

        if (currentPrice / requiredPrice < 1 + fee) {
          return;
        }

        console.log(currentStrategy, 'remove BEFORE second step');

        strategyEndSubject.next();

        kucoin.cancelOrder({ id: order.orderId })
          .then(() => {
            const sellAmount = processNumber((doneOrder.filledSize).toString(), buy, 'bids', true);

            return placeOrder({
              clientOid: v4(),
              side: 'sell',
              symbol: buy,
              funds: sellAmount,
            });
          })
          .catch((e) => {
            console.log(e, 'error on the canceling SECOND step of the strategy', currentStrategy);
          });
      }),

      tap(() => {
        if (openOrdersResponses.length !== 3) {
          return;
        }


        const order = openOrdersResponses[2];
        const fee = profitInfo.fees[2];
        const doneOrder = doneOrders[1];
        const currentPrice = parseFloat(symbolsOrderBookInfoMap[order.symbol].asks[0][0]);
        const requiredPrice = profitInfo.fakePrices[0];
        console.log('-----', buy2, currentStrategy);
        console.log(openOrdersResponses);
        console.log(order);
        console.log(symbolsOrderBookInfoMap[order.symbol].asks[0]);
        console.log(currentPrice, requiredPrice);
        console.log(currentPrice / requiredPrice, 1 + fee);

        if (currentPrice / requiredPrice > 1 - fee) {
          return;
        }

        console.log(currentStrategy, 'remove before THIRD step');

        strategyEndSubject.next();

        kucoin.cancelOrder({ id: order.orderId })
          .then(() => {
            const sellAmount = processNumber((doneOrder.filledSize).toString(), sell, 'bids', true);

            return placeOrder({
              clientOid: v4(),
              side: 'sell',
              symbol: buy,
              funds: sellAmount,
            });
          })
          .catch((e) => {
            console.log(e, 'error on the canceling THIRD step of the strategy', currentStrategy);
          });
      }),
      takeUntil(
        merge(
          placeOrderErrorSubject,
          strategyEndSubject
        )
      )
  ).subscribe();

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

        //console.log('--------', symbol);

        if (stepIndex == 2) {
          //console.log(symbol, floatMathPrice >= profitInfo.fakePrices[stepIndex], priceDiff(floatMathPrice, profitInfo.fakePrices[stepIndex]));
        } else {
          //console.log(symbol, floatMathPrice <= profitInfo.fakePrices[stepIndex], priceDiff(floatMathPrice, profitInfo.fakePrices[stepIndex]));
        }
        //console.log('--------');

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
    price: profitInfo.stringPrices[0].toString(),
    size: processNumber((profitInfo.buyCoins).toString(), buy, 'asks'),
  })
  .then((data) => {
    openOrdersResponses.push(data.data);
  });

  merge(ordersDoneSubject, balancesSubject)
    .pipe(
      tap(event => {
        if (event.order) {
          doneOrders.push(event.order);
        }

        if (event.balance) {
          availableMap[event.balance.currency] = parseFloat(event.balance.available);
        }
      }),
      tap(() => {
        if (doneOrders.length !== 1 || step !== 1) {
          return;
        }

        const order = doneOrders[0];
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

        //const buyFundsAmount = processNumber((filledSize).toString(), buy2, 'asks', true);
        const buyAmount = processNumber((profitInfo.buy2Coins).toString(), buy2, 'asks', false);

        placeOrder({
          clientOid: clientOidBuy2,
          side: 'buy',
          symbol: buy2,
          price: profitInfo.stringPrices[1].toString(),
          size: buyAmount,
          // funds: buyFundsAmount,
        });
      }),
      tap(() => {
        if (doneOrders.length !== 2 || step !== 2) {
          return;
        }

        const order = doneOrders[1];
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

        placeOrder({
          clientOid: clientOidSell,
          side: 'sell',
          symbol: sell,
          price: profitInfo.stringPrices[2].toString(),
          size: sellAmount,
        });

      }),
      tap(() => {
        if (doneOrders.length !== 3 || step !== 3) {
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
                const profitInfoAfter = calcProfit(currentStrategy, profitInfo.orderBookDepth);
                console.log('---- after strategyEndProfitinfo');
                //console.log(JSON.stringify(profitInfoAfter, null, 4));

                if (profitInfoAfter.strategy) {
                  profitInfoAfter.prices.forEach((item, index) => {
                    //console.log(currentStrategy[index], item / profitInfo.prices[index]);
                  })
                } else {
                  console.log('no way');
                }

                console.log();
                console.log();

                setTimeout(() => {
                  strategiesInProgress.delete(currentStrategy.join());

                  if (count >= maxStrategyTries && strategiesInProgress.size === 0) {
                    console.log(count, 'times really ?');
                    //console.log(JSON.stringify(executedStrategies, null, 4));
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
