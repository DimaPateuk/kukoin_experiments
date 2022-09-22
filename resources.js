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
    return value[0].split('-')[1] === 'USDT';
  })

  .map(entry => entry[1])

const allSymbols = Object.keys(
  strategies
  .reduce((res, pairs) => {
    pairs
      .forEach(pair => {
        res[pair] = true;
      });
    return res;
  }, {})
);

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
const socketCloseSubject = new Subject();
const strategyEndSubject = new Subject();

balancesSubject
  .subscribe(({balance}) => {
    if (balance.currency !== 'USDT') {
      return;
    }

    console.log('USDT', balance.available, balance.available - initialBalance.available);
  });

socketCloseSubject
  .subscribe(() => {
    Object
      .keys(symbolsOrderBookInfoMap)
      .forEach(key => {
        delete symbolsOrderBookInfoMap[key];
      });
  });

setInterval(() => {
  populateOrderBook();
}, 100);
function populateOrderBook() {
    let count = 0;

    while (symbolsOrderBookInfoMap[allSymbols[count]]) {
      count++;
    }

    if (count === allSymbols.length) {
      return;
    }

    const symbol = allSymbols[count];
    kucoin.getPartOrderBook({ amount: 20, symbol })
      .then((res) => {
        if (!symbolsOrderBookInfoMap[symbol]) {
          symbolsOrderBookInfoMap[symbol] = res.data;
        }
      });
}


const currenciesMap = {};
kucoin.getCurrencies()
  .then(response => {
    response.data
      .forEach(item => {
        currenciesMap[item.currency] = item;
      });
  });

const accountsInfo = {};
const initialBalance = {
  balance: 0,
  available: 0,
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

      initialBalance.balance = item.balance;
      initialBalance.available = item.available;

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
  allSymbols,
  baseFirstStepAmount,
  socketCloseSubject,
  strategyEndSubject,
  symbolsByTrackers,
  initialBalance
}
