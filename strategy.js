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
  socketCloseSubject,
  strategyEndSubject,
  ordersSubject,
  symbolsOrderBookInfoMap,
} = require('./resources');
const { calcProfit } = require('./calcProfit');
const { v4 } = require('uuid');


const maxTries = 1;
let oneStrategyInProgress = false;
let count = 0;

function startStrategy(currentStrategy, profitInfo) {
  if (oneStrategyInProgress) {
    return;
  }

  oneStrategyInProgress = true;

  const [buy, buy2, sell] = currentStrategy;
  const ordersClientIds = [v4(), v4(), v4()];
  const [clientOidBuy, clientOidBuy2, clientOidSell] = [v4(), v4(), v4()];

  console.log(currentStrategy, '---- started');
  console.log(currentStrategy, '----', ordersClientIds);
  console.log(JSON.stringify(profitInfo, null, 4));
  console.log(currentStrategy, '----');

  placeOrder({
    clientOid: clientOidBuy,
    side: 'buy',
    symbol: buy,
    //price: profitInfo.stringPrices[0].toString(),
    size: processNumber((profitInfo.buyCoins).toString(), buy, 'buy'),
  });

  const doneOrder = [];
  const availableMap = {};
  let step = 1;

  ordersSubject
    .pipe(
      tap((data) => {
        // console.log(ordersClientIds, data.clientOid, ordersClientIds.includes(data.clientOid));
        // console.log(data);

        if (!data.matchPrice) {
          return;
        }

        const { symbol, matchPrice } = data;
        const floatMathPrice = parseFloat(matchPrice);
        const bestAsk = parseFloat(symbolsOrderBookInfoMap[symbol].asks[0][0]);
        const bestBid = parseFloat(symbolsOrderBookInfoMap[symbol].bids[0][0]);
        const stepIndex = currentStrategy.indexOf(symbol);

        console.log('--------', symbol);
        console.log(symbol, 'matchPrice', floatMathPrice);
        console.log(symbol, 'required price', profitInfo.stringPrices[stepIndex]);
        console.log(symbol, 'bestAsk', bestAsk, 'bestBid', bestBid);

        if (stepIndex == 2) {
          console.log(symbol, floatMathPrice > profitInfo.stringPrices[stepIndex]);
        } else {
          console.log(symbol, floatMathPrice < profitInfo.stringPrices[stepIndex]);
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

        const buyAmount = processNumber((profitInfo.buy2Coins).toString(), buy2, 'buy');
        console.log('buy2', buy2, available, buyAmount);

        placeOrder({
          clientOid: clientOidBuy2,
          side: 'buy',
          symbol: buy2,
          //price: profitInfo.stringPrices[1].toString(),
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
        console.log(count, 'strategy end', currentStrategy);
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
                  const profitInfoAfter = calcProfit(currentStrategy, profitInfo.orderBookDepth);
                  const profitInfoReversStrategy = calcProfit(currentStrategy.reverse(), profitInfo.orderBookDepth);

                  console.log('profitInfoAfter', JSON.stringify(profitInfoAfter, null, 4));
                  console.log('profitInfoReversStrategy', JSON.stringify(profitInfoReversStrategy, null, 4));

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

  if (!profitInfo.strategy) {
    return;
  }
  //console.log(profitInfo.strategy, receive - spend);

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
