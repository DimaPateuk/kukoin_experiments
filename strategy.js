const { placeOrder, placeOrderErrorSubject } = require('./placeOrder');
const {
  takeUntil,
  tap,
  merge,
  Subject,
  interval,
} = require('rxjs');
const { processNumber } = require('./processNumber');
const {
  balancesSubject,
  strategies,
  ordersSubject,
  symbolsOrderBookInfoMap,
} = require('./resources');
const { calcProfit } = require('./calcProfit');
const { v4 } = require('uuid');
const { priceDiff } = require('./priceDiff');
const kucoin = require('./kucoin');
const { Strategy } =require('./strategyNew');


let count = 0;
const maxStrategyTries = 1;
const maxStrategiesInParallel = 3;
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

      if (count >= maxStrategyTries && strategiesInProgress.size === 0) {
        console.log(count, 'times really ?');
      }
    }, 5000);
  } });
}

function checkStrategy (currentStrategy) {
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
