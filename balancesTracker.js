require('dotenv').config()
const {infinitySocket} = require('./infinitySocket');
const kucoin = require('./kucoin');
const balanceInfo = {
};
const accountsInfo = {};

console.log('start balance tracker');
kucoin.getAccounts()
  .then(response => {
    accountsInfo.data = response.data;
    accountsInfo.data.forEach(item => {
      if (item.type !== 'trade') {
        return;
      }

      if (item.currency === 'USDT') {
        balanceInfo[item.currency] = { initial: item.available };

        return;
      }

      if (item.currency === 'KCS') {
        balanceInfo[item.currency] = { initial: item.available };

        return;
      }


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

  if (data.currency === 'USDT' || data.currency === 'KCS') {
    balanceInfo[data.currency].diff = data.available - balanceInfo[data.currency].initial;
  }
  console.clear();
  console.log(JSON.stringify(balanceInfo, null, 4));
  console.log(JSON.stringify(balancesMap, null, 4));
});
