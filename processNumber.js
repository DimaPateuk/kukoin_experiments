
const {
  symbolsInfo,
  MYbaseFee,
} = require('./resources');
const exactMath = require('exact-math');

function processNumber(strNumber, pair, type) {
  // const { myFeeMul } = tradeFeesMap[pair];
  // const num = parseFloat(strNumber);
  const num = exactMath.mul(parseFloat(strNumber), exactMath.add(1, -MYbaseFee));
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
