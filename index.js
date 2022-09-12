require('dotenv').config()
const kucoin = require('./kucoin')
const { v4 } = require('uuid')
const exactMath = require('exact-math')
const debounce = require('debounce')
const strategies = require('./pairs');
const { exec } = require("child_process");


// const strategies = {
//     "BTC-USDT,ETH-BTC,ETH-USDT": [
//         "BTC-USDT",
//         "ETH-BTC",
//         "ETH-USDT"
//     ],
// };

kucoin.init({
  apiKey: process.env.apiKey,
  secretKey: process.env.secretKey,
  passphrase: process.env.passphrase,
  environment: 'live'
});


const subjectsMap = {
};

let baseFee = {};
kucoin.baseFee()
  .then((response) => {
    baseFee = response;
    baseFee.takerFeeRate = parseFloat(response.data.takerFeeRate);
    baseFee.makerFeeRate = parseFloat(response.data.makerFeeRate);
  });


kucoin.initSocket({ topic: "allTicker" }, (msg) => {
  const parsedMessage = JSON.parse(msg);

  subjectsMap[parsedMessage.subject] = parsedMessage.data;

  makeCalculation();

});


const info = {};

function makeCalculation() {
  const strategiesArray = Object.keys(strategies);

  strategiesArray
    .forEach((strategyName) => {
      const [buy, buy2, sell] = strategies[strategyName];

      if (
        !subjectsMap[buy]?.bestBid ||
        !subjectsMap[buy2]?.bestBid ||
        !subjectsMap[sell]?.bestAsk ||
        !baseFee.takerFeeRate
      ) {
        return;
      }
      const pricesFlow = [
        subjectsMap[buy].bestAsk,
        subjectsMap[buy2].bestAsk,
        subjectsMap[sell].bestBid
      ].map(num => parseFloat(num));

      const prices = [
        pricesFlow[0],
        pricesFlow[1],
        pricesFlow[2]
      ];

      const MYbaseFee = 0.05;
      const spend = prices[0];
      const spend2 = exactMath.div(1 - MYbaseFee, exactMath.mul(prices[1],  1 + MYbaseFee));
      const receive = exactMath.mul(exactMath.mul(spend2, 1 - MYbaseFee), prices[2]);

      if (receive - spend < 0) {
        delete info[strategyName]
        return;
      }

      info[strategyName] = {
        prices,
        final: receive - spend
      };

    });

  const entries = Object
    .entries(info)

  // console.clear();
  entries
    .forEach(([key, value]) => {
      console.log('-----');
      console.log(key);
      console.log(value.prices);
      console.log(value.final);
    });
}


