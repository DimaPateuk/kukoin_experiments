const exactMath = require('exact-math');
const tradeFees = require('./tradeFees');
const { symbolsOrderBookInfoMap, symbolsInfo } = require('./resources');

Object
  .keys(tradeFees)
  .forEach(key => {
    if (tradeFees[key].takerFeeRate === '0') {
      tradeFees[key].takerFeeRate = '0.002';
    }

    if (tradeFees[key].makerFeeRate === '0') {
      tradeFees[key].makerFeeRate = '0.002';
    }
  });


function canCalc(currentStrategy, depth) {
  return currentStrategy.every(symbol => {
    return Boolean(symbolsOrderBookInfoMap[symbol]?.asks[depth]) && Boolean(symbolsOrderBookInfoMap[symbol]?.bids[depth]);
  });
}

function getBestAsk(symbol, depth) {
  return parseFloat(symbolsOrderBookInfoMap[symbol].asks[depth][0]);
}
function getBestBid(symbol, depth) {
  return parseFloat(symbolsOrderBookInfoMap[symbol].bids[depth][0]);
}

function parsePrices (currentStrategy, depth) {
  return getStringPrices(currentStrategy, depth)
    .map(num => parseFloat(num));
}

function parseSizes (currentStrategy, depth) {
  const [buy, buy2, sell] = currentStrategy;

  return [
    symbolsOrderBookInfoMap[buy].asks.slice(0, depth + 1).reduce((res, item ) => res + parseFloat(item[1]), 0),
    symbolsOrderBookInfoMap[buy2].asks.slice(0, depth + 1).reduce((res, item ) => res + parseFloat(item[1]), 0),
    symbolsOrderBookInfoMap[sell].bids.slice(0, depth + 1).reduce((res, item ) => res + parseFloat(item[1]), 0)
  ];
}

function getStringPrices (currentStrategy, depth) {
  const [buy, buy2, sell] = currentStrategy;
  return [
    symbolsOrderBookInfoMap[buy].asks[depth][0],
    symbolsOrderBookInfoMap[buy2].asks[depth][0],
    symbolsOrderBookInfoMap[sell].bids[depth][0]
  ];
}
const baseFirstStepAmount = 2;
const magicProfitRation = 0;

function calcProfit(currentStrategy, orderBookDepth) {

    if (!canCalc(currentStrategy, orderBookDepth)) {
      return {};
    }

    const getActualPrices = () => {
      return parsePrices(currentStrategy, orderBookDepth);
    };
    const getActualSizes = () => {
      return parseSizes(currentStrategy, orderBookDepth);
    };

    const [buy, buy2, sell] = currentStrategy;
    const spend = baseFirstStepAmount;
    const fees = currentStrategy.map((pair) => parseFloat(tradeFees[pair].takerFeeRate));
    const approximateFees = fees.map((fee) => (fee * baseFirstStepAmount));
    const approximateFeeForThreeSteps = approximateFees.reduce((res, fee) => res + (fee), 0) * 0.5;
    const prices = getActualPrices();
    const fakePrices = [
      prices[0] * (1 + magicProfitRation),
      prices[1] * (1 + magicProfitRation),
      prices[2] * (1 - magicProfitRation)
    ];
    const stringPrices = getStringPrices(currentStrategy, orderBookDepth);
    const sizes = getActualSizes();
    const buyCoins = exactMath.div(spend, fakePrices[0]);

    if (buyCoins * 5 > sizes[0]) {
      return {};
    }

    const buy2Coins = exactMath.div(buyCoins, fakePrices[1]);

    if (buy2Coins * 5 > sizes[1]) {
      return {};
    }

    if (buy2Coins * 5 > sizes[2]) {
      return {};
    }

    const receive = exactMath.mul(buy2Coins, fakePrices[2]);
    const profit = receive - (spend + approximateFeeForThreeSteps);

    const multipliedFees = fees.map(fee => fee * 5);
    const cancelMultipliers = [1 + multipliedFees[0], 1 + multipliedFees[1], 1 - multipliedFees[2]];

    return {
      cancelPrices: [
        fakePrices[0] * cancelMultipliers[0],
        fakePrices[1] * cancelMultipliers[1],
        fakePrices[2] * cancelMultipliers[2]
      ],
      strategy: currentStrategy,
      orderBookDepth,
      baseFirstStepAmount,
      spend,
      fees,
      prices,
      fakePrices,
      approximateFees,
      getActualPrices,
      printPricesInfo: () => {
        const actualPrices = getActualPrices();
        currentStrategy.forEach((item, index) => {
          console.log(item);
          console.log('when started', prices[index]);
          console.log('current', actualPrices[index]);

          console.log('%',  actualPrices[index] / prices[index]);
          console.log('diff',  actualPrices[index] - prices[index]);
        });
      },
      stringPrices,
      sizes,
      buyCoins,
      buy2Coins,
      receive,
      approximateFeeForThreeSteps,
      profit,
      buyOrderBookInfo: symbolsOrderBookInfoMap[buy].asks[orderBookDepth][0],
      buy2OrderBookInfo: symbolsOrderBookInfoMap[buy2].asks[orderBookDepth][0],
      sellOrderBookInfo: symbolsOrderBookInfoMap[sell].bids[orderBookDepth][0]
    };
}


module.exports = {
  calcProfit,
  getBestBid,
  getBestAsk,
};
