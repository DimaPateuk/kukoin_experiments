const exactMath = require('exact-math');
const tradeFees = require('./tradeFees');
const { baseFirstStepAmount } = require('./resources');

function calcProfit(prices, currentStrategy) {
    const fees = currentStrategy.map((pair) => parseFloat(tradeFees[pair].takerFeeRate));
    const spend = exactMath.mul(prices[0], fees[0] + 1);
    const spend2 = exactMath.div(
      baseFirstStepAmount,
      exactMath.mul(prices[1], fees[1] + 1)
      );
    const receive = exactMath.mul(
      spend2,
      exactMath.mul(prices[2], fees[2] + 1)
    );

    return {
      spend,
      spend2,
      receive,
    };
}

module.exports = {
  calcProfit,
};
