require('dotenv').config()
const kucoin = require('./kucoin')
const calculatedStrategies = require('./pairs');
const strategies = Object.values(calculatedStrategies);

const symbolsToTrack = Object.keys(
  strategies
  .reduce((res, pairs) => {
    pairs
      .forEach(pair => {
        res[pair] = true;
      });
    return res;
  }, {})
);

const mapTradeFee = {};
symbolsToTrack
  .reduce((res, item) => {
    if (res[res.length -1].length === 10) {
      res.push([]);
    }

    res[res.length -1].push(item);

    return res;
  }, [[]])
  .forEach((symbols, index, arr) => {
    setTimeout(() => {
      kucoin.getTradeFees({ symbols })
        .then(response => {
          response
            .data
            .forEach(item => {
              mapTradeFee[item.symbol] = item;
            });
          if (arr.length - 1 === index) {
            console.log(JSON.stringify(mapTradeFee, null, 4));
          }
        }, (err) => {
          console.log(err);
        });
    }, index * 2000)
  });
