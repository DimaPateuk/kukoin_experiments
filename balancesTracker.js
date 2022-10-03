require('dotenv').config()
const {infinitySocket} = require('./infinitySocket');

const balancesMap = {};
infinitySocket({ topic: "balances" }, (msg) => {
  const parsedMessage = JSON.parse(msg);

  if (parsedMessage.topic !== "/account/balance") {
    return;
  }

  const { data } = parsedMessage;

  balancesMap[data.currency] = parseFloat(data.available);
  console.clear();
  console.log('---', JSON.stringify(balancesMap, null, 4));
});
