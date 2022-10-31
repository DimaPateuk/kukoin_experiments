const {
  symbolsOrderBookInfoMap,
  balancesSubject,
  symbolsByTrackers,
  ordersSubject,
} = require('./resources');
const { makeCalculation } = require('./strategy');
const { infinitySocket } = require('./infinitySocket');
const {sellAll} = require('./sellAll');

sellAll(() => {

  setTimeout(() => {
    symbolsByTrackers
      .forEach((symbols) => {
        infinitySocket({ topic: "depth50", symbols }, (msg) => {
          const parsedMessage = JSON.parse(msg);
          const symbol = parsedMessage?.topic?.split(':')[1];
          if (!symbol) {
            return;
          }

          symbolsOrderBookInfoMap[symbol] = parsedMessage.data;
        });
      });

      setInterval(() => {
        makeCalculation();
      }, 10);
  }, 5000);

  infinitySocket({ topic: "orders" }, (msg) => {
    const parsedMessage = JSON.parse(msg);

    if (parsedMessage.topic !== "/spotMarket/tradeOrders") {
      return;
    }

    const { data } = parsedMessage;

    ordersSubject.next(data);

  });

  infinitySocket({ topic: "balances" }, (msg) => {
    const parsedMessage = JSON.parse(msg);

    if (parsedMessage.topic !== "/account/balance") {
      return;
    }

    const { data } = parsedMessage;
    balancesSubject.next(data);
  });

});
