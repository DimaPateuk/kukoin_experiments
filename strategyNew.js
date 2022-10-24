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
        term.off('key', this.ternHandler);

        onEnd();
      });

    this.trackOrders();
    this.trackRelevance();

    term.on( 'key' , this.ternHandler) ;

    console.log('---strategy START', this.currentStrategy);

    this.doFirstStep();
  }

  ternHandler = ( name , matches , data ) => {
    if ( name === 'CTRL_C' ) {
      terminate() ;
      return;
    }

    this.commandHandler(name);


  }

  commandHandler = (chunk) => {
    if (chunk === '1') {
      this.sellFirstStep();
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
      symbol: this.buySymbol,
      price: this.profitInfo.initialSellBestAsk.toString(),
      size: processNumber((this.profitInfo.sellCoins).toString(), this.sellSymbol, 'asks'),
    });
  }

  sellFirstStep() {
    const orderBuyFilledSize = parseFloat(this.trackOrderMap[this.buySymbol].current.filledSize);
    const orderSellFilledSize = parseFloat(this.trackOrderMap[this.sellSymbol].current.filledSize);

    placeOrder({
      clientOid: v4(),
      side: 'sell',
      symbol: this.buySymbol,
      size: processNumber((orderBuyFilledSize).toString(), this.buySymbol, 'bids'),
    });

    placeOrder({
      clientOid: v4(),
      side: 'sell',
      symbol: this.sellSymbol,
      size: processNumber((orderSellFilledSize).toString(), this.buySymbol, 'bids'),
    });
  }

  doneOrderAction(order) {
    console.log('---', this.currentStrategy, order.symbol);
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
          console.clear()
          this.profitInfo.printPricesInfo();
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

}

module.exports = {
  Strategy,
};
