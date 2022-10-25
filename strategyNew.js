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
const { getBestBid, getBestAsk } = require('./calcProfit');
const { v4 } = require('uuid');
const kucoin = require('./kucoin');
var term = require( 'terminal-kit' ).terminal ;

function terminate() {
	term.grabInput( false ) ;
	setTimeout( function() { process.exit() } , 100 ) ;
}

term.grabInput( { mouse: 'button' } ) ;

term.on('key' , ( name , matches , data ) => {
  if ( name !== 'CTRL_C' ) {
    return;
  }

  terminate() ;

}) ;
const maxTimeStrategyAlive = 10 * 60 * 1000;

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
        term.off('key', this.ternHandler);

        onEnd();
      });

    this.trackOrders();
    this.trackRelevance();

    term.on( 'key' , this.commandHandler) ;

    console.log('---strategy START', this.currentStrategy);

    this.doFirstStep();
  }

  commandHandler = (name) => {
    if (name === '1') {
      this.sellAll();
    }

    if (name == '2') {
      this.sellBuyToSell();
    }

    if (name == '3') {
      this.sellSellToBuy();
    }
  }

  doFirstStep() {
    placeOrder({
      clientOid: this.clientOidBuy,
      side: 'buy',
      symbol: this.buySymbol,
      price: this.profitInfo.initialBuyBestAsk.toString(),
      size: processNumber((this.profitInfo.buyCoins).toString(), this.buySymbol, 'asks'),
    });

    placeOrder({
      clientOid: this.clientOidSell,
      side: 'buy',
      symbol: this.sellSymbol,
      price: this.profitInfo.initialSellBestAsk.toString(),
      size: processNumber((this.profitInfo.sellCoins).toString(), this.sellSymbol, 'asks'),
    });
  }

  sellAll() {
    const orderBuyFilledSize = parseFloat(this.trackOrderMap[this.buySymbol].current.filledSize);
    const orderSellFilledSize = parseFloat(this.trackOrderMap[this.sellSymbol].current.filledSize);

    if (orderBuyFilledSize) {
      placeOrder({
        clientOid: v4(),
        side: 'sell',
        symbol: this.buySymbol,
        price: getBestBid(this.buySymbol, this.profitInfo.orderBookDepth),
        size: processNumber((orderBuyFilledSize).toString(), this.buySymbol, 'bids'),
      });
    } else {
      kucoin.cancelOrder({ orderId: this.trackOrderMap[this.buySymbol].current.orderId });
    }

    if (orderSellFilledSize) {
      placeOrder({
        clientOid: v4(),
        side: 'sell',
        symbol: this.sellSymbol,
        price: getBestBid(this.sellSymbol, this.profitInfo.orderBookDepth),
        size: processNumber((orderSellFilledSize).toString(), this.sellSymbol, 'bids'),
      });
    } else {
      kucoin.cancelOrder({ orderId: this.trackOrderMap[this.sellSymbol].current.orderId });
    }

    this.strategyEndSubject.next();
  }

  sellBuyToSell() {
    const doneFilledSize = parseFloat(this.trackOrderMap[this.sellSymbol].current.filledSize);
    const clientOid = v4();
    this.positiveOrdersClientIds.push(clientOid);

    const price = getBestBid(this.buy2Symbol, this.profitInfo.orderBookDepth);

    placeOrder({
      clientOid,
      side: 'sell',
      symbol: this.buy2Symbol,
      price,
      size: processNumber((doneFilledSize).toString(), this.buy2Symbol, 'bids'),
    });

    ordersSubject
      .pipe(
        tap((order) => {
          if (!clientOid === order.clientOid) {
            return;
          }

          if (order.status === 'done') {
            const firstDoneOrderFilledSize = parseFloat(this.trackOrderMap[this.buySymbol].current.filledSize);
            const orderFilledSize = parseFloat(order.filledSize);
            console.log(this.trackOrderMap[this.buySymbol].current);
            console.log(order);
            const resultSize = firstDoneOrderFilledSize + orderFilledSize * price * (1 - this.profitInfo.fees[1]);

            placeOrder({
              clientOid: v4(),
              side: 'sell',
              symbol: this.buySymbol,
              size: processNumber((resultSize).toString(), this.buySymbol, 'bids'),
            });

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

  sellSellToBuy() {
    const doneFilledSize = parseFloat(this.trackOrderMap[this.buySymbol].current.filledSize);
    const clientOid = v4();
    this.positiveOrdersClientIds.push(clientOid);

    const price = getBestAsk(this.buy2Symbol, this.profitInfo.orderBookDepth);

    placeOrder({
      clientOid,
      side: 'buy',
      symbol: this.buy2Symbol,
      price,
      size: processNumber((doneFilledSize / price).toString(), this.buy2Symbol, 'bids'),
    });

    ordersSubject
      .pipe(
        tap((order) => {
          if (!clientOid === order.clientOid) {
            return;
          }

          if (order.status === 'done') {
            const firstDoneOrderFilledSize = parseFloat(this.trackOrderMap[this.sellSymbol].current.filledSize);
            const orderFilledSize = parseFloat(order.filledSize);
            console.log(this.trackOrderMap[this.sellSymbol].current);
            console.log(order);
            const resultSize = firstDoneOrderFilledSize + orderFilledSize;

            placeOrder({
              clientOid: v4(),
              side: 'sell',
              symbol: this.sellSymbol,
              size: processNumber((resultSize).toString(), this.sellSymbol, 'bids'),
            });

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
        }),
        takeUntil(
          merge(
            this.strategyEndSubject,
            placeOrderErrorSubject,
          )
        )
      ).subscribe();
  }

  trackRelevance () {
    interval(10)
      .pipe(
        tap(() => {
          console.clear()
          this.profitInfo.printPricesInfo();
        }),
        takeUntil(
          merge(
            this.strategyEndSubject,
            placeOrderErrorSubject,
          )
        )
      ).subscribe();
  }

}

module.exports = {
  Strategy,
};
