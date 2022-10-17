const exactMath = require('exact-math');
const tradeFees = require('./tradeFees');
const { symbolsOrderBookInfoMap } = require('./resources');

function canCalc(currentStrategy, depth) {
  const [buy, buy2, sell] = currentStrategy;

  if (
    !symbolsOrderBookInfoMap[buy]?.asks[depth] ||
    !symbolsOrderBookInfoMap[buy2]?.asks[depth] ||
    !symbolsOrderBookInfoMap[sell]?.bids[depth]
  ) {
    return false;
  }

  return true;
}

function parsePrices (currentStrategy, depth) {
  const [buy, buy2, sell] = currentStrategy;

  return [
    symbolsOrderBookInfoMap[buy].asks[depth][0],
    symbolsOrderBookInfoMap[buy2].asks[depth][0],
    symbolsOrderBookInfoMap[sell].bids[depth][0]
  ].map(num => parseFloat(num));
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

    const [buy, buy2, sell] = currentStrategy;
    const spend = baseFirstStepAmount;
    const fees = currentStrategy.map((pair) => parseFloat(tradeFees[pair].takerFeeRate));
    const approximateFeeFroThreeSteps = fees.reduce((res, fee) => res + (fee * baseFirstStepAmount), 0) * 1;
    const prices = parsePrices(currentStrategy, orderBookDepth);
    const fakePrices = [
      prices[0] * (1 + magicProfitRation),
      prices[1] * (1 + magicProfitRation),
      prices[2] * (1 - magicProfitRation)
    ];
    const stringPrices = getStringPrices(currentStrategy, orderBookDepth);
    const sizes = parseSizes(currentStrategy, orderBookDepth);
    const buyCoins = exactMath.div(spend, fakePrices[0]);

    if (buyCoins * 5 > sizes[0]) {
      //console.log(currentStrategy, buy,'rejected by size', buyCoins, sizes[0]);
      return {};
    }

    const buy2Coins = exactMath.div(buyCoins, fakePrices[1]);

    if (buy2Coins * 5 > sizes[1]) {
      //console.log(currentStrategy, buy2,'rejected by size', buy2Coins, sizes[1]);
      return {};
    }

    if (buy2Coins * 5 > sizes[2]) {
      //console.log(currentStrategy, sell, 'rejected by size', buyCoins, sizes[2]);
      return {};
    }

    const receive = exactMath.mul(buy2Coins, fakePrices[2]);
    const profit = receive - (spend + approximateFeeFroThreeSteps);

    return {
      cancelPrices: [fakePrices[0] * 1.02, fakePrices[1] * 1.02, fakePrices[1] * 0.998],
      strategy: currentStrategy,
      orderBookDepth,
      baseFirstStepAmount,
      spend,
      fees,
      prices,
      fakePrices,
      getActualPrices: () => {
        return parsePrices(currentStrategy, orderBookDepth);
      },
      stringPrices,
      sizes,
      buyCoins,
      buy2Coins,
      receive,
      approximateFeeFroThreeSteps,
      profit,
      buyOrderBookInfo: symbolsOrderBookInfoMap[buy].asks[orderBookDepth][0],
      buy2OrderBookInfo: symbolsOrderBookInfoMap[buy2].asks[orderBookDepth][0],
      sellOrderBookInfo: symbolsOrderBookInfoMap[sell].bids[orderBookDepth][0]
    };
}

module.exports = {
  calcProfit,
};
