const { placeOrder, placeOrderErrorSubject } = require('./placeOrder');
const { balancesSubject } = require('./resources');

const { infinitySocket } = require('./infinitySocket');
const { v4 } = require('uuid');

infinitySocket({ topic: "balances" }, (msg) => {
  const parsedMessage = JSON.parse(msg);

  if (parsedMessage.topic !== "/account/balance") {
    return;
  }

  const { data } = parsedMessage;
  balancesSubject.next(data);
});

const clientOidBuy = v4();
const balancesMap = {};

setTimeout(() => {
  placeOrder({
    clientOid: clientOidBuy,
    side: 'buy',
    funds: '1',
    symbol: 'BTC-USDT',
  });
}, 5000);

balancesSubject
  .subscribe((balance) => {


    console.log(balance);
    if (balancesMap[balance.currency] === undefined) {
      balancesMap[balance.currency] = 0;
    }

    balancesMap[balance.currency] += parseFloat(balance.availableChange);

    console.log(balancesMap);
  });
