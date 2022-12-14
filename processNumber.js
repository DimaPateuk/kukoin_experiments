const tradeFees = require('./tradeFees');
const { symbolsInfo } = require('./resources');
const exactMath = require('exact-math');


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

function processNumber(strNumber, pair, type, isFunds) {
  const isUSDT = symbolsInfo[pair].feeCurrency === 'USDT';
  const fee = isUSDT ? 0 : parseFloat(tradeFees[pair].makerFeeRate) * 1; // i do not why
  const amount = isFunds ? symbolsInfo[pair].quoteIncrement : symbolsInfo[pair].baseIncrement;
  const countNumbersAfterDot = amount.split('.')[1].length;
  const cutStrNumber = cutNNumbersAfterDot(strNumber, countNumbersAfterDot);
  const strNumberMulOnFee = exactMath.mul(cutStrNumber, 1 - fee);

  return cutNNumbersAfterDot(strNumberMulOnFee.toString(), countNumbersAfterDot);
}

function processPrice(strNumber, pair) {
  const amount = symbolsInfo[pair].priceIncrement;
  const countNumbersAfterDot = amount.split('.')[1].length;
  return cutNNumbersAfterDot(strNumber, countNumbersAfterDot);
}

module.exports = {
  processNumber,
  processPrice,
};
