const { placeOrder, placeOrderErrorSubject } = require('./placeOrder');
const {
  takeUntil,
  tap,
  merge,
  Subject,
  interval,
  take,
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

    this.strategyEndSubject
      .pipe(
        take(1)
      )
      .subscribe(() => {
        console.log('---strategy END', this.currentStrategy);
        onEnd();
      });

    this.endOrPlaceOrderError$ = merge(
      placeOrderErrorSubject,
      this.strategyEndSubject
    );

    this.trackOrders();
    this.trackRelevance();

    console.log('---strategy START', this.currentStrategy);

    this.doFirstStep();
  }

  doFirstStep() {
    console.log(this.buySymbol, symbolsOrderBookInfoMap[this.buySymbol].asks[20][0], this.profitInfo.stringPrices[0].toString());

    placeOrder({
      clientOid: this.clientOidBuy,
      side: 'buy',
      symbol: this.buySymbol,
      price: parseFloat(symbolsOrderBookInfoMap[this.buySymbol].asks[20][0]),//this.profitInfo.stringPrices[0].toString(),
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
      console.log('call strategyEndSubject from doneOrderAction');
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
          this.checkRelevance();
        }),
        takeUntil(
          this.endOrPlaceOrderError$
        )
      ).subscribe();
  }

  checkRelevance() {
    // if (this.isFirstStepStillRelevant() &&
    //     this.isSecondStepStillRelevant() &&
    //     this.isThirdStepStillRelevant()
    // ) {
    //   return;
    // }

    if (this.trackOrderMap[this.buySymbol].current !== null &&
        this.trackOrderMap[this.buySymbol].current.status !== 'done'
    ) {
      this.cancelFirstStep();
      return;
    }

    // if (this.trackOrderMap[this.buy2Symbol].current !== null &&
    //     this.trackOrderMap[this.buy2Symbol].current.status !== 'done'
    // ) {
    //   this.cancelSecondStep();
    //   return;
    // }

    // if (this.trackOrderMap[this.sellSymbol].current !== null &&
    //     this.trackOrderMap[this.sellSymbol].current.status !== 'done'
    // ) {
    //   this.cancelThirdStep();
    //   return;
    // }

  }

  isFirstStepStillRelevant () {
    if (this.trackOrderMap[this.buySymbol].current?.status === 'done') {
      return true;
    }

    const bestAsk = parseFloat(symbolsOrderBookInfoMap[this.buySymbol].asks[0][0]);
    const requireAsk = this.profitInfo.fakePrices[0];
    const fee = this.profitInfo.fees[0] * 10;

    if (bestAsk / requireAsk < 1 + fee) {
      return true;
    }

    return false;
  }

  isSecondStepStillRelevant () {
    if (this.trackOrderMap[this.buy2Symbol].current.status === 'done') {
      return true;
    }

    const bestAsk = parseFloat(symbolsOrderBookInfoMap[this.buy2Symbol].asks[0][0]);
    const requireAsk = this.profitInfo.fakePrices[1];
    const fee = this.profitInfo.fees[1] * 1;

    if (bestAsk / requireAsk < 1 + fee) {
      return true;
    }

    return false;
  }

  isThirdStepStillRelevant () {
    if (this.trackOrderMap[this.sellSymbol].current?.status === 'done') {
      return true;
    }

    const bestBids = parseFloat(symbolsOrderBookInfoMap[this.sellSymbol].bids[0][0]);
    const requireBids = this.profitInfo.fakePrices[2];
    const fee = this.profitInfo.fees[2] * 1;

    if (bestBids / requireBids > 1 - fee) {
      return true;
    }

    return false;
  }

  cancelFirstStep() {
    const order = this.trackOrderMap[this.buySymbol].current;
    this.strategyEndSubject.next();

    kucoin
      .cancelOrder({ id: order.orderId })
      .then((e) => {
        console.log(e);
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
