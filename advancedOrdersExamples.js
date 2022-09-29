// kucoin.initSocket({ topic: "advancedOrders" }, (msg) => {
  //   const parsedMessage = JSON.parse(msg);
  //   if (parsedMessage.topic !== "/spotMarket/advancedOrders") {
  //     return;
  //   }

  //   const { data } = parsedMessage;

  // }, () => {
  //   socketCloseSubject.next();
  // });
  // setTimeout(() => {
  //   placeOrder({
  //     symbol: 'BTC-USDT',
  //     stop: 'loss',
  //     stopPrice: '20200',
  //     side: 'buy',
  //     funds: '1'
  //   });
  // }, 4000);
  // setTimeout(() => {

  //   placeOrder({
  //     symbol: 'BTC-USDT',
  //     stop: 'entry',
  //     stopPrice: '20000',
  //     side: 'sell',
  //     size: '0.00004977'
  //   });

  // }, 500);
