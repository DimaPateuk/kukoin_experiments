const tradeFees = require('./tradeFees');
const { symbolsOrderBookInfoMap } = require('./resources');
const exactMath = require('exact-math');

function getNumbersAfterDot(symbol, type) {
  console.log(symbol, type);
  console.log(symbolsOrderBookInfoMap[symbol][type]);

  return symbolsOrderBookInfoMap[symbol][type]
    .reduce((res, item) => {
      console.log(res, item);
      return Math.max(res, item[1].split('.')[1]?.length || 0)
    }, 0);
}

function cutNNumbersAfterDot(strNumber, countNumbersAfterDot) {
  const [before, after] = strNumber.split('.');

  if (!after) {
    return before;
  }

  const nextAfter = after.substring(0, countNumbersAfterDot);

  if (nextAfter.length === 0) {
    return before;
  }

  return `${before}.${nextAfter}`;
}

function processNumber(strNumber, pair, type) {
  const isUSDT = pair.split('-')[1] === 'USDT';
  const fee = isUSDT ? 0 : parseFloat(tradeFees[pair].makerFeeRate) * 1.5; // i do not why
  const countNumbersAfterDot = getNumbersAfterDot(pair, type);
  const cutStrNumber = cutNNumbersAfterDot(strNumber, countNumbersAfterDot);
  const strNumberMulOnFee = exactMath.mul(cutStrNumber, 1 - fee);

  return cutNNumbersAfterDot(strNumberMulOnFee.toString(), countNumbersAfterDot);
}

module.exports = {
  processNumber,
};
