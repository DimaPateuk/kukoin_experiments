require('dotenv').config()
const kucoin = require('./kucoin')
const { Subject } = require('rxjs')

const symbolsInfo = {};
kucoin.getSymbols()
  .then(response => {
    response
      .data
      .forEach(item => {
        symbolsInfo[item.symbol] = item;
      });
  });

function updateSubjectsInfo() {
  // return kucoin.getAllTickers()
  //   .then(response => {
  //     response
  //       .data
  //       .ticker
  //       .forEach(item => {
  //         symbolsOrderBookInfoMap[item.symbol] = {
  //           bestAsk: item.buy,
  //           bestBid: item.sell,
  //         }
  //       });
  //   });
}
updateSubjectsInfo();

const symbolsOrderBookInfoMap = {};
const ordersSubject = new Subject();
const balancesSubject = new Subject();
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
  updateSubjectsInfo,
  balancesSubject
}
