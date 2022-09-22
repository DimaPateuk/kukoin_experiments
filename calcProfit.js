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

function calcProfit(currentStrategy, orderBookDepth) {
    if (!canCalc(currentStrategy, orderBookDepth)) {
      return {};
    }

    const prices = parsePrices(currentStrategy, orderBookDepth);
    const fees = currentStrategy.map((pair) => parseFloat(tradeFees[pair].takerFeeRate));
    let spend = exactMath.mul(
      exactMath.mul(prices[0], fees[0] + 1),
      1
    );
    'TRX-USDT'
    const buy2Action = exactMath.div(
      exactMath.add(1, -fees[1]),
      prices[1]
    );
    'WIN-TRX'
    const receive = exactMath.mul(
      buy2Action,
      prices[2],

    );
    'WIN-USDT'
    spend = exactMath.add(
      spend,
      exactMath.mul(receive, fees[2]),
    );

    return {
      prices,
      spend,
      receive,
    };
}

module.exports = {
  calcProfit,
};
