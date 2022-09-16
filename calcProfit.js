const exactMath = require('exact-math');

function calcProfit(prices, MYbaseFee) {
    const spend = prices[0];
    const spend2 = exactMath.div(1 - MYbaseFee, exactMath.mul(prices[1], 1 + MYbaseFee));
    const receive = exactMath.mul(exactMath.mul(spend2, 1 - MYbaseFee), prices[2]);

    return {
        spend,
        spend2,
        receive,
    };
}

module.exports = {
    calcProfit,
};
