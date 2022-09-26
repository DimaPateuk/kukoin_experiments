const kucoin = require('./kucoin');
const {
  ordersDoneSubject,
  symbolsOrderBookInfoMap,
  balancesSubject,
  symbolsByTrackers,
  socketCloseSubject,
  allSymbols,
  ordersSubject,
} = require('./resources');
const { makeCalculation } = require('./strategy');

setTimeout(() => {
  symbolsByTrackers
    .forEach((symbols) => {
      kucoin.create().initSocket({ topic: "depth5", symbols }, (msg) => {
        const parsedMessage = JSON.parse(msg);
        const symbol = parsedMessage?.topic?.split(':')[1];
        if (!symbol) {
          //console.log(parsedMessage);
          return;
        }
        symbolsOrderBookInfoMap[symbol] = parsedMessage.data;
      }, () => {
          socketCloseSubject.next();
      }, () => {
        // open socket
      });
    });

    setInterval(() => {
      makeCalculation();
    }, 10);
}, 1000);

kucoin.initSocket({ topic: "orders" }, (msg) => {
  const parsedMessage = JSON.parse(msg);

  if (parsedMessage.topic !== "/spotMarket/tradeOrders") {
    return;
  }

  const { data } = parsedMessage;

  ordersSubject.next(data);


  if (data.status === 'done') {
    ordersDoneSubject.next({ order: data });
  }
}, () => {
  socketCloseSubject.next();
});

kucoin.initSocket({ topic: "balances" }, (msg) => {
  const parsedMessage = JSON.parse(msg);

  if (parsedMessage.topic !== "/account/balance") {
    return;
  }

  const { data } = parsedMessage;
  balancesSubject.next({ balance: data });
}, () => {
  socketCloseSubject.next();
});
