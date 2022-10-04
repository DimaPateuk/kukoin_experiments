require('dotenv').config()
const {infinitySocket} = require('./infinitySocket');
const kucoin = require('./kucoin');
const balanceInfo = {
  balance: 0,
  available: 0,
};
const accountsInfo = {};
kucoin.getAccounts()
  .then(response => {
    accountsInfo.data = response.data;
    accountsInfo.data.forEach(item => {
      if (item.type !== 'trade') {
        return;
      }

      if (item.currency !== 'USDT') {
        return;
      }

      balanceInfo.balance = item.balance;
      balanceInfo.available = item.available;
      balanceInfo.USDT = 0;
    });
  });
const balancesMap = {};

infinitySocket({ topic: "balances" }, (msg) => {
  const parsedMessage = JSON.parse(msg);

  if (parsedMessage.topic !== "/account/balance") {
    return;
  }

  const { data } = parsedMessage;

  balancesMap[data.currency] = parseFloat(data.available);
  console.clear();
  if (data.currency === 'USDT') {
    balanceInfo.USDT = data.available - balanceInfo.available;
  }
  console.log(balanceInfo.USDT);
  console.log(JSON.stringify(balancesMap, null, 4));
});
