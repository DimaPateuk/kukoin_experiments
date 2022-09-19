const tradeFees = require('./tradeFees');
const { symbolsInfo } = require('./resources');
const exactMath = require('exact-math');

function processNumber(strNumber, pair, type) {
  const isUSDT = pair.split('-')[1] === 'USDT';
  const fee = isUSDT ? 0 : parseFloat(tradeFees[pair].takerFeeRate);
  const floatNumber = parseFloat(strNumber);

  const num = exactMath.mul(floatNumber, exactMath.add(1, -fee));
  const [beforeDot, afterDot] = num.toString().split('.');

  if (!afterDot) {
    return strNumber;
  }

  const amount = type === 'buy' ? symbolsInfo[pair].quoteIncrement : symbolsInfo[pair].baseIncrement;
  const countNumbersAfterDot = amount.split('.')[1].length;

  return `${beforeDot}.${afterDot.substring(0, countNumbersAfterDot)}`;
}

module.exports = {
  processNumber,
};
