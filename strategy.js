const { strategies } = require('./resources');
const { calcProfit } = require('./calcProfit');
const { Strategy } = require('./strategyNew');

let count = 0;
const maxStrategyTries = 5000;
const maxStrategiesInParallel = 2;
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

  new Strategy({
    currentStrategy, profitInfo, onEnd: () => {
      setTimeout((isSuccessful) => {
        strategiesInProgress.delete(currentStrategy.join());


        if (isSuccessful) {
          countSuccessfulStrategy++;
        } else {
          countUnsuccessfulStrategy++;
        }

        console.log('totalCount', count);
        if (count >= maxStrategyTries && strategiesInProgress.size === 0) {

          console.log('countSuccessfulStrategy', countSuccessfulStrategy);
          console.log('countUnsuccessfulStrategy', countUnsuccessfulStrategy);

          console.log(count, 'times really ?');
          process.exit(1);
        }
      }, 5000);
    }
  });
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
