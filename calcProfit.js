const exactMath = require('exact-math');
const tradeFees = require('./tradeFees');

function calcProfit(prices, currentStrategy) {
    const fees = currentStrategy.map((pair) => parseFloat(tradeFees[pair].takerFeeRate));
    let spend = exactMath.mul(
      exactMath.mul(prices[0], fees[0] + 1),
      1
    );
    'TRX-USDT'
    const buy2 = exactMath.div(
      exactMath.add(1, -fees[1]),
      prices[1]
    );
    'WIN-TRX'
    const receive = exactMath.mul(
      buy2,
      prices[2],

    );
    'WIN-USDT'
    spend = exactMath.add(
      spend,
      exactMath.mul(receive, fees[2]),
    );

    return {
      spend,
      receive,
    };
}

module.exports = {
  calcProfit,
};
