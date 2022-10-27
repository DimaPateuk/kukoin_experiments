const { placeOrder, placeOrderErrorSubject } = require('./placeOrder');
const {
  takeUntil,
  tap,
  merge,
  Subject,
  interval,
  take,
  first,
} = require('rxjs');
const { processNumber } = require('./processNumber');
const { ordersSubject } = require('./resources');
const { getBestBid, getBestAsk } = require('./calcProfit');
const { v4 } = require('uuid');
const kucoin = require('./kucoin');

const maxTimeStrategyAlive = 10 * 60 * 1000;

let countSuccessfulStrategy = 0;
let countUnsuccessfulStrategy = 0;

class Strategy {
  constructor({
    currentStrategy,
    profitInfo,
    onEnd,
  }) {
    this.startedAt = +new Date();
    this.currentStrategy = currentStrategy;

    this.profitInfo = profitInfo;

    this.buySymbol = this.currentStrategy[0];
    this.buy2Symbol = this.currentStrategy[1];
    this.sellSymbol = this.currentStrategy[2];

    this.positiveOrdersClientIds = Array(3).fill(0).map(() => {
      return `${v4()}`;
    });
    this.negativeOrdersClientIds = Array(2).fill(0).map(() => {
      return `${v4()}`;
    });

    this.clientOidBuy = this.positiveOrdersClientIds[0];
    this.clientOidBuy2 = this.positiveOrdersClientIds[1];
    this.clientOidSell = this.positiveOrdersClientIds[2];

    this.negativeClientOidBuy = this.negativeOrdersClientIds[0];
    this.negativeClientOidBuy2 = this.negativeOrdersClientIds[1];

    this.strategyEndSubject = new Subject();
    this.cancelStrategySubject = new Subject();

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
      .subscribe((isSuccessful) => {
        console.log('---strategy END', this.currentStrategy);

        if (isSuccessful) {
          countSuccessfulStrategy++;
        } else {
          countUnsuccessfulStrategy++;
        }

        console.log('countSuccessfulStrategy', countSuccessfulStrategy);
        console.log('countUnsuccessfulStrategy', countUnsuccessfulStrategy);
        onEnd();
      });

    this.trackOrders();
    this.trackRelevance();


    console.log('---strategy START', this.currentStrategy);

    this.doFirstStep();
  }


  doFirstStep() {
    console.log(this.buySymbol, this.profitInfo.stringPrices[0], 'will be canceled when price: ' , this.profitInfo.cancelPrices[0]);

    placeOrder({
      clientOid: this.clientOidBuy,
      side: 'buy',
      symbol: this.buySymbol,
      price: this.profitInfo.stringPrices[0].toString(),
      size: processNumber((this.profitInfo.buyCoins).toString(), this.buySymbol, 'asks'),
    });
  }

  doSecondStep () {
    const buyAmount = processNumber((this.profitInfo.buy2Coins).toString(), this.buy2Symbol, 'asks', false);

    console.log(this.buy2Symbol, this.profitInfo.stringPrices[1], 'will be canceled when price: ' , this.profitInfo.cancelPrices[1]);

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

    console.log(this.sellSymbol, this.profitInfo.stringPrices[2],'will be canceled when price: ' , this.profitInfo.cancelPrices[2]);

    placeOrder({
      clientOid: this.clientOidSell,
      side: 'sell',
      symbol: this.sellSymbol,
      price: this.profitInfo.stringPrices[2].toString(),
      size: sellAmount,
    });
  }

  doneOrderAction(order) {
    if (order.symbol === this.buySymbol) {
      this.doSecondStep();
    }

    if (order.symbol === this.buy2Symbol) {
      this.doThirdStep();
    }

    if (order.symbol === this.sellSymbol) {
      console.log('call strategyEndSubject from doneOrderAction');
      this.strategyEndSubject.next(true);
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
          merge(
            this.strategyEndSubject,
            placeOrderErrorSubject,
            this.cancelStrategySubject
          )
        )
      ).subscribe();
  }

  trackRelevance () {
    interval(10)
      .pipe(
        tap(() => {
          this.checkIfStrategyIsNotRelevant();
        }),
        takeUntil(
          merge(
            this.strategyEndSubject,
            placeOrderErrorSubject,
            this.cancelStrategySubject
          )
        )
      ).subscribe();
  }

  checkIfStrategyIsNotRelevant() {
    if (this.isFirstStepStillRelevant() &&
        this.isSecondStepStillRelevant() &&
        this.isThirdStepStillRelevant() &&
        this.isStrategyRelevantByTime()
    ) {
      return;
    }

    if (this.trackOrderMap[this.sellSymbol].current !== null &&
        this.trackOrderMap[this.sellSymbol].current.status !== 'done'
    ) {
      this.cancelThirdStep();
      return;
    }

    if (this.trackOrderMap[this.buy2Symbol].current !== null &&
        this.trackOrderMap[this.buy2Symbol].current.status !== 'done'
    ) {
      this.cancelSecondStep();
      return;
    }
    if (
      this.trackOrderMap[this.buySymbol].current !== null &&
      this.trackOrderMap[this.buySymbol].current.status !== 'done'
    ) {
      this.cancelFirstStep();
      return;
    }

  }

  isStrategyRelevantByTime() {
    if (+new Date() - this.startedAt < maxTimeStrategyAlive) {
      return true;
    }

    console.log(this.currentStrategy, 'Should be canceled because Time!!! step not relevant');
    return false;
  }

  isFirstStepStillRelevant () {
    if (this.trackOrderMap[this.buySymbol].current?.status === 'done') {
      return true;
    }

    const bestAsk = getBestAsk(this.buySymbol, 0);

    if (bestAsk < this.profitInfo.cancelPrices[0]) {
      return true;
    }
    console.log(this.currentStrategy, 'Should be canceled because first step not relevant');
    return false;
  }

  isSecondStepStillRelevant () {
    if (this.trackOrderMap[this.buy2Symbol].current?.status === 'done') {
      return true;
    }

    const bestAsk = getBestAsk(this.buy2Symbol, 0);

    if (bestAsk < this.profitInfo.cancelPrices[1]) {
      return true;
    }
    console.log(this.currentStrategy, 'Should be canceled because Second step not relevant');
    return false;
  }

  isThirdStepStillRelevant () {
    if (this.trackOrderMap[this.sellSymbol].current?.status === 'done') {
      return true;
    }

    const bestBid = getBestBid(this.sellSymbol, 0);

    if (bestBid > this.profitInfo.cancelPrices[2]) {
      return true;
    }

    console.log(this.currentStrategy, 'Should be canceled because Third step not relevant');
    return false;
  }

  stopButTrackDoneOrders() {
    this.cancelStrategySubject.next();

    ordersSubject
      .pipe(
        tap((order) => {
          if (order.status !== 'done') {
            if (order.type === 'canceled') {
              console.log('not done order with canceled type that is strange.')
              console.log(order);
              process.exit(1);
            }
            return;
          }

          if (this.positiveOrdersClientIds.includes(order.clientOid)) {
            if (order.type === 'filled') {

              const orderInfo = this.trackOrderMap[order.symbol];

              orderInfo.current = order;
              orderInfo.sequence.push(order);

              console.log('Indeed order performed during canceling!!!!');

              if (order.clientOid === this.positiveOrdersClientIds[0]) {
                this.sellFirstStep();
                return;
              }

              if (order.clientOid === this.positiveOrdersClientIds[1]) {
                this.sellSecondStep();
                return;
              }
            }

            if (order.type === 'canceled') {
              if (order.clientOid === this.positiveOrdersClientIds[0]) {
                console.log('cancel first step');
                this.strategyEndSubject.next();
                // do not need to do anything
              }

              if (order.clientOid === this.positiveOrdersClientIds[1]) {
                console.log('cancel second step');
                this.sellFirstStep();
              }

              if (order.clientOid === this.positiveOrdersClientIds[2]) {
                console.log('cancel third step');
                this.sellSecondStep();
              }
            }
          }

          if (this.negativeOrdersClientIds.includes(order.clientOid)) {
            this.strategyEndSubject.next();
          }
        }),
        takeUntil(
          merge(
            this.strategyEndSubject,
            placeOrderErrorSubject,
          )
        )
      ).subscribe();
  }

  cancelFirstStep() {
    const order = this.trackOrderMap[this.buySymbol].current;

    this.stopButTrackDoneOrders();

    kucoin
      .cancelOrder({ id: order.orderId })
      .then((e) => {
      })
      .catch((e) => {
        console.log('first step cancel issue', e);

        process.exit(1);
      });
  }

  sellFirstStep() {
    const doneOrder = this.trackOrderMap[this.buySymbol].current;
    const sellAmount = processNumber((doneOrder.filledSize).toString(), this.buySymbol, 'bids', false);

    return placeOrder({
      clientOid: this.negativeClientOidBuy,
      side: 'sell',
      symbol: this.buySymbol,
      size: sellAmount,
    });
  }

  cancelSecondStep() {
    const order = this.trackOrderMap[this.buy2Symbol].current;

    this.stopButTrackDoneOrders();

    kucoin
      .cancelOrder({ id: order.orderId })
      .then(e => {
      })
      .catch((e) => {
        console.log('seconds step cancel issue', e);

        process.exit(1);
      });

  }

  sellSecondStep() {
    const doneOrder = this.trackOrderMap[this.buy2Symbol].current;
    const sellAmount = processNumber((doneOrder.filledSize).toString(), this.sellSymbol, 'bids');

    return placeOrder({
      clientOid: this.negativeClientOidBuy2,
      side: 'sell',
      symbol: this.sellSymbol,
      size: sellAmount,
    });
  }

  cancelThirdStep() {
    const order = this.trackOrderMap[this.sellSymbol].current;

    this.stopButTrackDoneOrders();

    kucoin
      .cancelOrder({ id: order.orderId })
      .then(e => {
      })
      .catch((e) => {
        console.log('third step cancel issue', e);
        process.exit(1);
      });
  }

}

module.exports = {
  Strategy,
};
