const { strategies } = require('./resources');
const { calcProfit } = require('./calcProfit');
const { Strategy } = require('./strategyNew');

let count = 0;
const maxStrategyTries = 100;
const maxStrategiesInParallel = 1;
const strategiesInProgress = new Map();

let countSuccessfulStrategy = 0;
let countUnsuccessfulStrategy = 0;

function shouldWait(currentStrategy) {
  if (count >= maxStrategyTries) {
    return true;
  }

  if (strategiesInProgress.has(currentStrategy.join())) {
    return true;
  }

  return strategiesInProgress.size >= maxStrategiesInParallel;
}


function startStrategy(currentStrategy, profitInfo) {
  if (shouldWait(currentStrategy)) {
    return;
  }

  count++;

  strategiesInProgress.set(currentStrategy.join(), currentStrategy);

  let countSt = 5;
  const onEnd = (isSuccessful) => {
    countSt--;
    if (isSuccessful) {
      countSuccessfulStrategy++;
    } else {
      countUnsuccessfulStrategy++;
    }

    if (countSt === 0) {
      setTimeout(() => {
        strategiesInProgress.delete(currentStrategy.join());
      }, 5000);
    }

    console.log('totalCount', count);
    console.log('countSuccessfulStrategy', count);
    console.log('countUnsuccessfulStrategy', count);
    if (count >= maxStrategyTries && strategiesInProgress.size === 0) {

      console.log('countSuccessfulStrategy', countSuccessfulStrategy);
      console.log('countUnsuccessfulStrategy', countUnsuccessfulStrategy);

      console.log(count, 'times really ?');
      process.exit(0);
    }
  }

  new Strategy({ currentStrategy, profitInfo, onEnd });
  new Strategy({ currentStrategy, profitInfo, onEnd });
  new Strategy({ currentStrategy, profitInfo, onEnd });
  new Strategy({ currentStrategy, profitInfo, onEnd });
  new Strategy({ currentStrategy, profitInfo, onEnd });
}

function checkStrategy(currentStrategy) {
  doRealStrategy(currentStrategy, 0);
}

function doRealStrategy(currentStrategy, orderBookDepth) {
  const profitInfo = calcProfit(currentStrategy, orderBookDepth);

  if (!profitInfo.strategy) {
    return;
  }

  if (profitInfo.profit > 0) {
    startStrategy(currentStrategy, profitInfo);
  }
}

function makeCalculation() {
  strategies.forEach(checkStrategy);
}

module.exports = {
  makeCalculation,
};
