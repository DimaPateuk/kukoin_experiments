const kucoin = require('./kucoin');
const {
  ordersSubject,
  symbolsOrderBookInfoMap,
  balancesSubject,
  symbolsToTrack,
  getAllTickersInfo,
} = require('./resources');
const { makeCalculation } = require('./strategy');

setTimeout(() => {
  // kucoin.initSocket({ topic: "allTicker" }, (msg) => {
  //   const parsedMessage = JSON.parse(msg);
  //   symbolsOrderBookInfoMap[parsedMessage.subject] = parsedMessage.data;

  //   makeCalculation();

  // }, () => {
  //   Object
  //     .keys(symbolsOrderBookInfoMap)
  //     .forEach(key => {
  //       delete symbolsOrderBookInfoMap[key];
  //     });
  // });

  kucoin.initSocket({ topic: "ticker", symbols: symbolsToTrack }, (msg) => {
    const parsedMessage = JSON.parse(msg);

    const symbol = parsedMessage?.topic?.split(':')[1];
    if (!symbol) {
      console.log(parsedMessage);
      return;
    }
    symbolsOrderBookInfoMap[symbol] = parsedMessage.data;


    makeCalculation();

  }, () => {
    Object
      .keys(symbolsOrderBookInfoMap)
      .forEach(key => {
        delete symbolsOrderBookInfoMap[key];
      });
  }, () => {
    //getAllTickersInfo();
  });
}, 1000);


kucoin.initSocket({ topic: "orders" }, (msg) => {
  const parsedMessage = JSON.parse(msg);

  if (parsedMessage.topic !== "/spotMarket/tradeOrders") {
    return;
  }

  const { data } = parsedMessage;

  if (data.status === 'done') {
    ordersSubject.next({ order: data });
  }
});

kucoin.initSocket({ topic: "balances" }, (msg) => {
  const parsedMessage = JSON.parse(msg);

  if (parsedMessage.topic !== "/account/balance") {
    return;
  }

  const { data } = parsedMessage;
  balancesSubject.next({ balance: data });
});
