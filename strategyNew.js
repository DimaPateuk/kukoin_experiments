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


    // const [buyCoinsId] = this.buySymbol.split('-');
    // const [buy2CoinsId] = this.buy2Symbol.split('-');


    // function calcPossibleBuyCoinsCancelStrategy() {
    //   return calcSubProfit(buyCoinsId, orderBookDepth, buyCoins);
    // }

    // function calcPossibleBuy2CoinsCancelStrategy() {
    //   return calcSubProfit(buy2CoinsId, orderBookDepth, buy2Coins);
    // }

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

  cancelAndTakeSubProfit() {

  }

  checkIfStrategyIsNotRelevant() {
    if (this.trackOrderMap[this.buy2Symbol].current !== null &&
      this.trackOrderMap[this.buy2Symbol].current.status === 'done'
    ) {
      const initialCoins = parseFloat(this.trackOrderMap[this.buy2Symbol].current.filledSize);
      const subProfit = this.profitInfo.subProfitOfBuy2Coins;

      const [variant] = subProfit.calcCancelStrategy(
        initialCoins,
        this.profitInfo.spend + this.profitInfo.approximateFees[0] + this.profitInfo.approximateFees[1]
      );
      console.log('subProfitOfBuy2Coins', variant);
    } else if (this.trackOrderMap[this.buySymbol].current !== null &&
        this.trackOrderMap[this.buySymbol].current.status === 'done'
      ) {
        const initialCoins = parseFloat(this.trackOrderMap[this.buySymbol].current.filledSize);
        const subProfit = this.profitInfo.subProfitOfBuyCoins;

        const [variant] = subProfit.calcCancelStrategy(
          initialCoins,
          this.profitInfo.spend + this.profitInfo.approximateFees[0]
        );
        console.log('subProfitOfBuyCoins', variant);
      }

    if (this.isFirstStepStillRelevant() &&
        this.isSecondStepStillRelevant() &&
        this.isThirdStepStillRelevant() &&
        this.isStrategyRelevantByTime()
    ) {
      return;
    }

    if (this.trackOrderMap[this.buySymbol].current !== null &&
        this.trackOrderMap[this.buySymbol].current.status !== 'done'
    ) {
      this.cancelFirstStep();
      return;
    }

    if (this.trackOrderMap[this.buy2Symbol].current !== null &&
        this.trackOrderMap[this.buy2Symbol].current.status !== 'done'
    ) {
      this.cancelSecondStep();
      return;
    }

    if (this.trackOrderMap[this.sellSymbol].current !== null &&
        this.trackOrderMap[this.sellSymbol].current.status !== 'done'
    ) {
      this.cancelThirdStep();
      return;
    }

    console.log(this.trackOrderMap);
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

  cancelSecondStep() {
    const doneOrder = this.trackOrderMap[this.buySymbol].current;
    const order = this.trackOrderMap[this.buy2Symbol].current;

    this.cancelStepOfPositiveStrategy(doneOrder, order, this.buySymbol);
  }

  cancelThirdStep() {
    const doneOrder = this.trackOrderMap[this.buy2Symbol].current;
    const order = this.trackOrderMap[this.sellSymbol].current;

    this.cancelStepOfPositiveStrategy(doneOrder, order, this.sellSymbol);
  }

  cancelStepOfPositiveStrategy(doneOrder, order, sellSymbol) {
    this.cancelStrategySubject.next();
    const orderSymbolIndex = this.currentStrategy.indexOf(order.symbol);

    console.log('cancel', order.symbol);
    kucoin
      .cancelOrder({ id: order.orderId })
      .then(e => {
        console.log(`trying to cancel ${sellSymbol} step ${orderSymbolIndex}`, e);
      })
      .catch((e) => {
        console.log(`trying to cancel ${sellSymbol} step ${orderSymbolIndex} issue`, e);
      });

    const order$ = ordersSubject
      .subscribe((canceledOrder) => {
        if (canceledOrder.clientOid !== order.clientOid) {
          return;
        }

        order$.unsubscribe();
        console.log(`----trying to cancel ${sellSymbol} step ${orderSymbolIndex}`);
        const sellAmount = processNumber((doneOrder.filledSize).toString(), sellSymbol, 'bids');

        return placeOrder({
          clientOid: v4(),
          side: 'sell',
          symbol: sellSymbol,
          size: sellAmount,
        }).then(() => {
          this.strategyEndSubject.next();
        });
      });
  }
}

module.exports = {
  Strategy,
};
