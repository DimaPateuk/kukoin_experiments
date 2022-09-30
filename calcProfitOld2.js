const exactMath = require('exact-math');
const tradeFees = require('./tradeFees');
const { symbolsOrderBookInfoMap, baseFirstStepAmount } = require('./resources');

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

function calcProfit(currentStrategy, orderBookDepth) {
    if (!canCalc(currentStrategy, orderBookDepth)) {
      return {};
    }
    const [buy, buy2, sell] = currentStrategy;
    const spend = baseFirstStepAmount;
    const fees = currentStrategy.map((pair) => parseFloat(tradeFees[pair].takerFeeRate) * 2);
    const prices = parsePrices(currentStrategy, orderBookDepth);
    const stringPrices = getStringPrices(currentStrategy, orderBookDepth);
    const sizes = parseSizes(currentStrategy, orderBookDepth);
    const feeFirstStep = exactMath.mul(spend, fees[0]);
    const buyCoins = exactMath.div(spend, prices[0]);

    if (buyCoins * 1 > sizes[0]) {
      //console.log(currentStrategy, buy,'rejected by size', buyCoins, sizes[0]);
      return {};
    }

    const availableToSell = exactMath.mul(buyCoins, 1 - fees[1]); // here fee calculated, no need to remove it from receive
    const buy2Coins = exactMath.div(availableToSell, prices[1]);

    if (buy2Coins * 1 > sizes[1]) {
      //console.log(currentStrategy, buy2,'rejected by size', buy2Coins, sizes[1]);
      return {};
    }

    if (buy2Coins * 1 > sizes[2]) {
      //console.log(currentStrategy, sell, 'rejected by size', buyCoins, sizes[2]);
      return {};
    }

    const receiveWithoutFee = exactMath.mul(buy2Coins, prices[2]);
    const feeThirdStep =  exactMath.mul(receiveWithoutFee, fees[2]);
    const totalFee = exactMath.add(feeFirstStep, feeThirdStep);
    const receive = exactMath.add(receiveWithoutFee, -totalFee);

    return {
      strategy: currentStrategy,
      orderBookDepth,
      spend,
      fees,
      prices,
      stringPrices,
      sizes,
      feeFirstStep,
      buyCoins,
      availableToSell,
      buy2Coins,
      receiveWithoutFee,
      feeThirdStep,
      totalFee,
      receive,
      buyOrderBookInfo: symbolsOrderBookInfoMap[buy].asks[orderBookDepth][0],
      buy2OrderBookInfo: symbolsOrderBookInfoMap[buy2].asks[orderBookDepth][0],
      sellOrderBookInfo: symbolsOrderBookInfoMap[sell].bids[orderBookDepth][0]
    };
}

module.exports = {
  calcProfit,
};
