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
const { priceDiff } = require('./priceDiff');


const maxTries = 10;
let oneStrategyInProgress = false;
let count = 0;



function startStrategy(currentStrategy, profitInfo) {
  if (oneStrategyInProgress) {
    return;
  }

  oneStrategyInProgress = true;

  const [buy, buy2, sell] = currentStrategy;

  if (buy.split('-')[0] === buy2.split('-')[0]) {
    throw new Error(currentStrategy);
  }
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
    price: profitInfo.stringPrices[0].toString(),
    size: processNumber((profitInfo.buyCoins).toString(), buy, 'asks'),
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

        const { symbol, matchPrice } = data;
        const floatMathPrice = parseFloat(matchPrice);
        const bestAsk = parseFloat(symbolsOrderBookInfoMap[symbol].asks[0][0]);
        const bestBid = parseFloat(symbolsOrderBookInfoMap[symbol].bids[0][0]);
        const stepIndex = currentStrategy.indexOf(symbol);

        console.log('--------', symbol);
        // console.log(symbol, 'matchPrice', floatMathPrice);
        // console.log(symbol, 'required price', profitInfo.fakePrices[stepIndex]);
        // console.log(symbol, 'bestAsk', bestAsk, 'bestBid', bestBid);

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

        const buyAmount = processNumber((profitInfo.buy2Coins).toString(), buy2, 'asks');
        console.log('buy2 !!!!!!', buy2, available, buyAmount);

        placeOrder({
          clientOid: clientOidBuy2,
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

        const sellAmount = processNumber((available).toString(), sell, 'bids');
        console.log('sell !!!!!', sell, available, sellAmount);

        placeOrder({
          clientOid: clientOidSell,
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
              })
            ),
          strategyEndSubject
            .pipe(
              tap(() => {
                count++;
                if (count < maxTries) {
                  setTimeout(() => {
                    oneStrategyInProgress = false;
                  }, 1000);

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

function checkStrategy (currentStrategy, index) {

  if (currentStrategy.join() === [ 'ATOM-USDT', 'ATOM-ETH', 'ETH-USDT' ].join()) {
    throw new Error('ss');
  }

  console.log(currentStrategy);

  // if (oneStrategyInProgress) {
  //   return;
  // }

  // for(let i = 3; i >=0; i--) {
  //   doRealStrategy(currentStrategy, i, index);
  // }

}

function doRealStrategy(currentStrategy, orderBookDepth, index) {
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
  // console.log(index, profitInfo.strategy, receive - spend);

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

  strategies.forEach(checkStrategy);
}



module.exports = {
  makeCalculation,
};
