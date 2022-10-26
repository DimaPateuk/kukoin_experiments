const { strategies } = require('./resources');
const { calcProfit } = require('./calcProfit');
const { calcProfit2 } = require('./calcProfit2');
const { Strategy } =require('./strategyNew');

let count = 0;
const maxStrategyTries = 100;
const maxStrategiesInParallel = 5;
const strategiesInProgress = new Map();
const executedStrategies = [];

function shouldWait(currentStrategy) {
  if (count >= maxStrategyTries) {
    return true;
  }

  if(strategiesInProgress.has(currentStrategy.join())) {
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

  new Strategy({ currentStrategy, profitInfo, onEnd: () => {
    setTimeout(() => {
      strategiesInProgress.delete(currentStrategy.join());

      console.log('totalCount', count);
      if (count >= maxStrategyTries && strategiesInProgress.size === 0) {
        console.log(count, 'times really ?');
        process.exit(1);
      }
    }, 5000);
  } });
}

function checkStrategy (currentStrategy) {
    doRealStrategy(currentStrategy, 0);
}

function doRealStrategy(currentStrategy, orderBookDepth) {
  const profitInfo = calcProfit(currentStrategy, orderBookDepth);
  const profitInfo2 = calcProfit2(currentStrategy, orderBookDepth);

  if (!profitInfo.strategy) {
    return;
  }

  console.log(profitInfo.profit, profitInfo2.profit, profitInfo.profit - profitInfo2.profit);
  console.log(profitInfo.prices[0], profitInfo2.prices[0]);

  if (profitInfo.profit > 0) {
    // startStrategy(currentStrategy, profitInfo);
  }
}

function makeCalculation() {
  strategies.forEach(checkStrategy);
}

module.exports = {
  makeCalculation,
};
