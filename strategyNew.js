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
const {
  balancesSubject,
  strategies,
  ordersSubject,
  symbolsOrderBookInfoMap,
} = require('./resources');
const { calcProfit, calcSubProfit } = require('./calcProfit');
const { v4 } = require('uuid');
const { priceDiff } = require('./priceDiff');
const kucoin = require('./kucoin');


const maxTimeStrategyAlive = 30 * 60 * 1000;

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

    this.clientOidBuy = this.positiveOrdersClientIds[0];
    this.clientOidBuy2 = this.positiveOrdersClientIds[1];
    this.clientOidSell = this.positiveOrdersClientIds[2];

    this.strategyEndSubject = new Subject();
    this.ordersDoneSubject = new Subject();
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
      .subscribe(() => {
        console.log('---strategy END', this.currentStrategy);
        console.log(this.profitInfo);
        this.profitInfo.printPricesInfo();
        console.log('-----');
        onEnd();
      });

    this.trackOrders();
    this.trackRelevance();

    console.log('---strategy START', this.currentStrategy);

    this.doFirstStep();
  }

  doFirstStep() {
    console.log(this.buySymbol, 'will be canceled when price: ' , this.profitInfo.cancelPrices[0]);

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

    console.log(this.buy2Symbol, 'will be canceled when price: ' , this.profitInfo.cancelPrices[1]);

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

    console.log(this.sellSymbol, 'will be canceled when price: ' , this.profitInfo.cancelPrices[2]);

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

  cancelAndTakeSubProfit(orderToCancel, variant) {
    this.cancelStrategySubject.next();
    const { cancelStrategy, initialCoins } = variant;
    const clientOids = cancelStrategy.map(() => v4());
    console.log('sub profit cancel', orderToCancel.symbol);
    kucoin
      .cancelOrder({ id: orderToCancel.orderId })
      .then(e => {
        console.log(`sub profit trying to cancel ${orderToCancel.symbol}`, e);
      })
      .catch((e) => {
        console.log(`sub profit trying to cancel ${orderToCancel.symbol} issue`, e);
      });

    const doneOrders = [];

    const order$ = ordersSubject
      .subscribe((someOrder) => {
        if (someOrder.clientOid === orderToCancel.clientOid ) {
          const sellAmount = processNumber((initialCoins).toString(), cancelStrategy[doneOrders.length], 'bids');
          console.log('sub profit cancel existing order');
          return placeOrder({
            clientOid: clientOids[doneOrders.length],
            side: 'sell',
            symbol: cancelStrategy[doneOrders.length],
            size: sellAmount,
          });
        }

        if (clientOids.includes(someOrder.clientOid) && someOrder.status === 'done') {
          doneOrders.push(someOrder);

          console.log('sub profit place order done', doneOrders);
          console.log('sub profit place order clientOids', clientOids);

          const nextClientOid = clientOids[doneOrders.length];

          console.log('sub profit next client Oid', nextClientOid);
          if (nextClientOid) {
            const nextSymbol = cancelStrategy[doneOrders.length];
            console.log('nextClientOid', someOrder);
            const sellAmount = processNumber((someOrder.filledSize).toString(), nextSymbol, 'bids', true);

            return placeOrder({
              clientOid: nextClientOid,
              side: 'sell',
              symbol: nextSymbol,
              funds: sellAmount,
            });
          }
        }

        console.log('sub profit should end ?', doneOrders.length, clientOids.length);
        if (doneOrders.length === clientOids.length) {
          order$.unsubscribe();
          this.strategyEndSubject.next();
        }
      });
  }

  checkIfStrategyIsNotRelevant() {
    console.clear();
    console.log('----', this.currentStrategy);
    this.profitInfo.printPricesInfo();


    const hardStop = !(
      this.isFirstStepStillRelevant() &&
      this.isSecondStepStillRelevant() &&
      this.isThirdStepStillRelevant() &&
      this.isStrategyRelevantByTime()
    );

    function shouldTakeSubProfit (variant) {
      if (hardStop) {
        return true;
      }
      return variant.profit > 0;
    }

    if (
      this.trackOrderMap[this.buy2Symbol].current !== null &&
      this.trackOrderMap[this.buy2Symbol].current.status === 'done'
    ) {
      const initialCoins = parseFloat(this.trackOrderMap[this.buy2Symbol].current.filledSize);
      const subProfit = this.profitInfo.subProfitOfBuy2Coins;
      const possibleVariants = subProfit.calcCancelStrategy(
        initialCoins,
        this.profitInfo.spend + this.profitInfo.approximateFees[0] + this.profitInfo.approximateFees[1]
      );
      const [bestVariant] = possibleVariants;
      const orderToCancel = this.trackOrderMap[this.sellSymbol].current;
      console.log('subProfitOfBuy2Coins', bestVariant);
      console.log(orderToCancel, shouldTakeSubProfit(bestVariant));
      console.log(possibleVariants);

      if (orderToCancel && shouldTakeSubProfit(bestVariant)) {

        this.cancelAndTakeSubProfit(orderToCancel, bestVariant);
        return;
      }
    } else if (
      this.trackOrderMap[this.buySymbol].current !== null &&
      this.trackOrderMap[this.buySymbol].current.status === 'done'
    ) {
      const initialCoins = parseFloat(this.trackOrderMap[this.buySymbol].current.filledSize);
      const subProfit = this.profitInfo.subProfitOfBuyCoins;
      const possibleVariants = subProfit.calcCancelStrategy(
        initialCoins,
        this.profitInfo.spend + this.profitInfo.approximateFees[0]
      );
      const [bestVariant] = possibleVariants;
      const orderToCancel = this.trackOrderMap[this.buy2Symbol].current;
      console.log('subProfitOfBuyCoins', bestVariant);
      console.log(orderToCancel, shouldTakeSubProfit(bestVariant));
      console.log(possibleVariants);

      if (orderToCancel && shouldTakeSubProfit(bestVariant)) {

        this.cancelAndTakeSubProfit(orderToCancel, bestVariant);
        return;
      }
    }

    if (
      this.trackOrderMap[this.buySymbol].current !== null &&
      this.trackOrderMap[this.buySymbol].current.status !== 'done' &&
      hardStop
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

    const bestAsk = parseFloat(symbolsOrderBookInfoMap[this.buySymbol].asks[0][0]);

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

    const bestAsk = parseFloat(symbolsOrderBookInfoMap[this.buy2Symbol].asks[0][0]);

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

    const bestBid = parseFloat(symbolsOrderBookInfoMap[this.sellSymbol].bids[0][0]);

    if (bestBid > this.profitInfo.cancelPrices[2]) {
      return true;
    }

    console.log(this.currentStrategy, 'Should be canceled because Third step not relevant');
    return false;
  }

  cancelFirstStep() {
    const order = this.trackOrderMap[this.buySymbol].current;

    this.cancelStrategySubject.next();

    console.log('cancel', order.symbol);
    kucoin
      .cancelOrder({ id: order.orderId })
      .then((e) => {
        console.log('trying to cancel first step', e);

        this.strategyEndSubject.next();
      })
      .catch((e) => {
        console.log('trying to cancel first step issue', e);
      });
  }
}

module.exports = {
  Strategy,
};
