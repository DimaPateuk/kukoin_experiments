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


class Strategy {
  constructor({
    currentStrategy,
    profitInfo,
    onEnd,
  }) {
    this.currentStrategy = currentStrategy;
    this.profitInfo = profitInfo;
    this.buySymbol = this.currentStrategy[0];
    this.buy2Symbol = this.currentStrategy[1];
    this.sellSymbol = this.currentStrategy[2];
    this.positiveOrdersClientIds = Array(3).fill(0).map(() => {
      return `${v4()}`;
    });
    this.clientOidBuy = this.positiveOrdersClientIds[0];
    this.clientOidBuy2 = this.positiveOrdersClientIds[1];
    this.clientOidSell = this.positiveOrdersClientIds[2];
    this.strategyEndSubject = new Subject();
    this.ordersDoneSubject = new Subject();
    this.trackOrderMap = {
      [this.buySymbol]: {
        current: null,
        sequence: [],
      },
      [this.buy2Symbol]: {
        current: null,
        sequence: [],
      },
      [this.sellSymbol]: {
        current: null,
        sequence: [],
      }
    };

    this.endOrPlaceOrderError$ = merge(
      placeOrderErrorSubject,
      this.strategyEndSubject
    ).pipe(
      tap(() => {
        console.log('---strategy END', this.currentStrategy);
        onEnd();
      })
    );

    this.trackOrders();
    this.trackRelevance();
    this.doFirstStep();
  }

  doFirstStep() {
    placeOrder({
      clientOid: this.clientOidBuy,
      side: 'buy',
      symbol: this.buySymbol,
      price: symbolsOrderBookInfoMap[this.buySymbol].bids[20][0],//this.profitInfo.stringPrices[0].toString(),
      size: processNumber((this.profitInfo.buyCoins).toString(), this.buySymbol, 'asks'),
    });
  }

  doSecondStep () {
    const buyAmount = processNumber((this.profitInfo.buy2Coins).toString(), this.buy2Symbol, 'asks', false);

    placeOrder({
      clientOid: this.clientOidBuy2,
      side: 'buy',
      symbol: this.buy2Symbol,
      price: this.profitInfo.stringPrices[1].toString(),
      size: buyAmount,
    });
  }

  doThirdStep() {
    const order = this.trackOrderMap[this.buy2Symbol].current;
    const filledSize = parseFloat(order.filledSize);
    const sellAmount = processNumber((filledSize).toString(), this.sellSymbol, 'bids');

    placeOrder({
      clientOid: this.clientOidSell,
      side: 'sell',
      symbol: this.sellSymbol,
      price: this.profitInfo.stringPrices[2].toString(),
      size: sellAmount,
    });
  }

  doneOrderAction(order) {
    console.log('---', this.currentStrategy, order.symbol);
    if (order.symbol === this.buySymbol) {
      this.doSecondStep();
    }

    if (order.symbol === this.buy2Symbol) {
      this.doThirdStep();
    }

    if (order.symbol === this.sellSymbol) {
      this.strategyEndSubject.next();
    }
  }

  trackOrders() {
    ordersSubject
      .pipe(
        tap((order) => {
          if (!this.positiveOrdersClientIds.includes(order.clientOid)) {
            return;
          }

          const orderInfo = this.trackOrderMap[order.symbol];

          orderInfo.current = order;
          orderInfo.sequence.push(order);

          if (order.status === 'done') {
            this.doneOrderAction(order);
          }

        }),
        takeUntil(
          this.endOrPlaceOrderError$
        )
      ).subscribe();
  }

  trackRelevance () {
    interval(10)
      .pipe(
        tap(() => {
          if (!this.isFirstStepStillRelevant()) {
            console.log('The first step is not relevant');
            return;
          }

          if (!this.isSecondStepStillRelevant()) {
            console.log('The second step is not relevant');
            return;
          }

          if (!this.isThirdStepStillRelevant()) {
            console.log('The third step is not relevant');
            return;
          }
        }),
        takeUntil(
          this.endOrPlaceOrderError$
        )
      ).subscribe();
  }

  isFirstStepStillRelevant () {
    if (this.trackOrderMap[this.buySymbol].current === null) {
      return true;
    }

    if (this.trackOrderMap[this.buySymbol].current?.status === 'done') {
      return true;
    }

    const bestAsk = parseFloat(symbolsOrderBookInfoMap[this.buySymbol].asks[0][0]);
    const requireAsk = this.profitInfo.fakePrices[0];
    const fee = this.profitInfo.fees[0] * 1;

    if (bestAsk / requireAsk < 1 + fee) {
      return true;
    }
    console.log(bestAsk, requireAsk, bestAsk / requireAsk);
    this.cancelFirstStep();

    return false;
  }

  isSecondStepStillRelevant () {
    if (this.trackOrderMap[this.buy2Symbol].current === null) {
      return true;
    }

    if (this.trackOrderMap[this.buy2Symbol].current.status === 'done') {
      return true;
    }

    const bestAsk = parseFloat(symbolsOrderBookInfoMap[this.buy2Symbol].asks[0][0]);
    const requireAsk = this.profitInfo.fakePrices[1];
    const fee = this.profitInfo.fees[1] * 1;

    if (bestAsk / requireAsk < 1 + fee) {
      return true;
    }

    console.log(bestAsk, requireAsk, bestAsk / requireAsk);

    this.cancelSecondStep();

    return false;
  }

  isThirdStepStillRelevant () {
    if (this.trackOrderMap[this.sellSymbol].current === null) {
      return true;
    }

    if (this.trackOrderMap[this.sellSymbol].current?.status === 'done') {
      return true;
    }

    const bestBids = parseFloat(symbolsOrderBookInfoMap[this.sellSymbol].bids[0][0]);
    const requireBids = this.profitInfo.fakePrices[2];
    const fee = this.profitInfo.fees[2] * 1;

    if (bestBids / requireBids > 1 - fee) {
      return true;
    }

    console.log(bestBids, requireBids, bestBids / requireBids);
    this.cancelThirdStep();

    return false;
  }

  cancelFirstStep() {
    const order = this.trackOrderMap[this.buySymbol].current;

    kucoin
      .cancelOrder({ id: order.orderId })
      .catch((e) => {
        console.log(e);
        this.strategyEndSubject.next();
        console.log('cancel', order.symbol);
      });
  }

  cancelSecondStep() {
    const doneOrder = this.trackOrderMap[this.buySymbol].current;
    const order = this.trackOrderMap[this.buy2Symbol].current;

    //this.strategyEndSubject.next();

    console.log('cancel', order.symbol);
    // kucoin
    //   .cancelOrder({ id: order.orderId })
    //   .then(() => {
    //     const sellAmount = processNumber((doneOrder.filledSize).toString(), this.buySymbol, 'bids', true);
    //     return placeOrder({
    //       clientOid: v4(),
    //       side: 'sell',
    //       symbol: this.buySymbol,
    //       funds: sellAmount,
    //     });
    //   })
    //   .catch((e) => {
    //     console.log(e);

    //   });
  }

  cancelThirdStep() {
    const doneOrder = this.trackOrderMap[this.buy2Symbol].current;
    const order = this.trackOrderMap[this.sellSymbol].current;

    //this.strategyEndSubject.next();

    console.log('cancel', order.symbol);
    // kucoin
    //   .cancelOrder({ id: order.orderId })
    //   .then(() => {
    //     const sellAmount = processNumber((doneOrder.filledSize).toString(), this.sellSymbol, 'bids', true);

    //     return placeOrder({
    //       clientOid: v4(),
    //       side: 'sell',
    //       symbol: this.sellSymbol,
    //       funds: sellAmount,
    //     });
    //   })
    //   .catch((e) => {
    //     console.log(e);

    //   });
  }
}

module.exports = {
  Strategy,
};
