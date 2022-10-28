require('dotenv').config()
const kucoin = require('./kucoin');
const { processNumber } = require('./processNumber');
const { symbolsInfo } = require('./resources');
const { v4 } = require('uuid');


function sellAll(onEnd) {
  console.log('------------------------------- sellAll');
  const balanceInfo = [];
  setTimeout(() => {
    kucoin.getAccounts()
      .then(response => {

        response.data.forEach(item => {
          if (item.type !== 'trade') {
            return;
          }

          if (item.available === '0') {
            return;
          }

          if (['KCS', 'USDT'].includes(item.currency)) {
            return;
          }
          const symbol = `${item.currency}-USDT`;
          const symbolI = symbolsInfo[symbol];
          if (!symbolI) {
            return;
          }

          if (parseFloat(symbolI.baseMinSize) > parseFloat(item.available)) {
            return;
          }

          balanceInfo.push(item);
        });

      });
  }, 500);


  setTimeout(() => {

    balanceInfo.forEach((item, index) => {
      setTimeout(() => {
        const symbol = `${item.currency}-USDT`;
        const sellAmount = processNumber(item.available, symbol, 'bids');

        kucoin.placeOrder({
          type: 'market',
          clientOid: v4(),
          side: 'sell',
          symbol: symbol,
          size: sellAmount,
        })
        .then(console.log, console.log);

        if (index === balanceInfo.length - 1) {
          setTimeout(() => {
            onEnd();
          }, 1500)
        }
      }, index * 200);

    });

  }, 1500);
}

module.exports = {
  sellAll,
}
