require('dotenv').config()
const kucoin = require('./kucoin')
const { Subject } = require('rxjs')
const calculatedStrategies = require('./pairs');
const strategies = Object
  .entries(calculatedStrategies)
  .filter(([key, value]) => {
    return key.indexOf('KCS') === -1;
  })
  // .filter(([key, value]) => {
  //   return key.indexOf('BTC') === -1;
  // })
  // .filter(([key, value]) => {
  //   return key.indexOf('ETH') === -1;
  // })
  // .filter(([key, value]) => {
  //   return key.indexOf('USDC') === -1;
  // })
  .filter(([key, value]) => {
    return value[0].split('-')[1] === 'USDT';
  })
  .filter(([key, value]) => {

    // return key === 'BTC-USDT,ETH-BTC,ETH-USDT';

    const allowed = [
      'BTC',
      'ETH',
    ];

    return allowed.includes(value[0].split('-')[0]);
  })
  .map(entry => entry[1]);

const allSymbols = [
  // 'TRX-USDT', 'WIN-TRX', 'WIN-USDT'
].concat(Object.keys(
  strategies
  .reduce((res, pairs) => {
    pairs
      .forEach(pair => {
        res[pair] = true;
      });
    return res;
  }, {})
));

const symbolsByTrackers = allSymbols.reduce((res, item) => {
  if (res[res.length -1].length === 120) {
    res.push([]);
  }

  res[res.length -1].push(item);

  return res;
}, [[]])

const symbolsInfo = {};
kucoin.getSymbols()
  .then(response => {
    response
      .data
      .forEach(item => {
        symbolsInfo[item.symbol] = item;
      });
  });

const symbolsOrderBookInfoMap = {};

const ordersSubject = new Subject();
const balancesSubject = new Subject();

balancesSubject
  .subscribe(({balance}) => {
    if (balance.currency === 'USDT') {
      balanceInfo.current = balance.available;
    }
  });

const currenciesMap = {};
kucoin.getCurrencies()
  .then(response => {
    response.data
      .forEach(item => {
        currenciesMap[item.currency] = item;
      });

      //console.log(JSON.stringify(currenciesMap, null, 4));
  });

const accountsInfo = {};
const balanceInfo = {
  balance: 0,
  available: 0,
  current: 0,
};
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
      balanceInfo.current = item.available;

      console.log(
        'balance',
        item.balance,
        'available',
        item.available,
      );
    });
  });

module.exports = {
  symbolsInfo,
  accountsInfo,
  currenciesMap,
  symbolsOrderBookInfoMap,
  balancesSubject,
  strategies,
  allSymbols,
  symbolsByTrackers,
  balanceInfo,
  ordersSubject
}
