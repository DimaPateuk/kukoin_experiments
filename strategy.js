const { strategies } = require('./resources');
const { calcProfit } = require('./calcProfit');
const { Strategy } = require('./strategyNew');

let count = 0;
const maxStrategyTries = 100;
const maxStrategiesInParallel = 4;
const strategiesInProgress = new Map();

let countSuccessfulStrategy = 0;
let countUnsuccessfulStrategy = 0;

const cancellInfo = {
  becauesofTime: {},
};

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

  setTimeout(() => {
    console.log('move forward!');
    strategiesInProgress.delete(currentStrategy.join());
  }, 10000);
  let countSt = 1;
  const onEnd = (isSuccessful, cancelledPoint) => {
    countSt--;
    if (isSuccessful) {
      countSuccessfulStrategy++;
    } else {
      countUnsuccessfulStrategy++;
    }

    const info = cancelledPoint.becauesofTime ? cancellInfo.becauesofTime : cancellInfo;

    Object.entries(cancelledPoint)
      .forEach(([key, value]) => {
        if (key === 'becauesofTime') {
          return;
        }

        if (!info[value]) {
          info[value] = 0;
        }

        info[value]++;

      });

    if (countSt === 0) {
      // setTimeout(() => {
      //   console.log('move forward!');
      //   strategiesInProgress.delete(currentStrategy.join());
      // }, 5000);
    } else {
      console.log('can not move formard, need:', countSt);
    }

    console.log('totalCount', count);
    console.log('countSuccessfulStrategy', countSuccessfulStrategy);
    console.log('countUnsuccessfulStrategy', countUnsuccessfulStrategy);
    console.log(JSON.stringify(cancellInfo, null, 4));

    if (count >= maxStrategyTries && strategiesInProgress.size === 0) {

      console.log('countSuccessfulStrategy', countSuccessfulStrategy);
      console.log('countUnsuccessfulStrategy', countUnsuccessfulStrategy);

      console.log(count, 'times really ?');
      process.exit(0);
    }
  }


  new Array(countSt)
    .fill(0)
    .forEach(() => {
      new Strategy({ currentStrategy, profitInfo, onEnd });
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

  // console.clear();
  console.log(profitInfo.profit);
  // if (profitInfo.profit > 0) {
  //   startStrategy(currentStrategy, profitInfo);
  // }
}

function makeCalculation() {
  strategies.forEach(checkStrategy);
}

module.exports = {
  makeCalculation,
};
