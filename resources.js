require('dotenv').config()
const kucoin = require('./kucoin')
const { Subject } = require('rxjs')
const calculatedStrategies = require('./pairs');
const baseFirstStepAmount = 1.5;
const strategies = Object
  .entries(calculatedStrategies)
  .filter(([key, value]) => {
    return key.indexOf('KCS') === -1;
  })
  .filter(([key, value]) => {
    return key.indexOf('KNC') === -1;
  })
  .filter(([key, value]) => {
    return value[0].split('-')[1] === 'USDT';
  })

  .filter(([key, value]) => {
    return value[0].split('-')[0] !== 'USDC';
  })
  .map(entry => entry[1])

const symbolsToTrack = Object.keys(
  strategies
  .reduce((res, pairs) => {
    if (Object.keys(res).length + 3 > 110) {
      return res;
    }
    pairs
      .forEach(pair => {
        res[pair] = true;
      });
    return res;
  }, {})
);

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
const socketCloseSubject = new Subject();
const strategyEndSubject = new Subject();
balancesSubject
  .subscribe(({balance}) => {
    if (balance.currency !== 'USDT') {
      return;
    }

    console.log('USDT', balance.available);
  });


const currenciesMap = {};
kucoin.getCurrencies()
  .then(response => {
    response.data
      .forEach(item => {
        currenciesMap[item.currency] = item;
      });
  });

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
  ordersSubject,
  symbolsOrderBookInfoMap,
  balancesSubject,
  strategies,
  symbolsToTrack,
  baseFirstStepAmount,
  socketCloseSubject,
  strategyEndSubject
}
