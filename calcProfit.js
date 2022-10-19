const exactMath = require('exact-math');
const tradeFees = require('./tradeFees');
const { symbolsOrderBookInfoMap, symbolsInfo } = require('./resources');


function canCalc(currentStrategy, depth) {
  return currentStrategy.every(symbol => {
    return Boolean(symbolsOrderBookInfoMap[symbol]?.asks[depth]) && Boolean(symbolsOrderBookInfoMap[symbol]?.bids[depth]);
  });
}

function getBestAsk(symbol, depth) {
  return parseFloat(symbolsOrderBookInfoMap[symbol].asks[depth][0]);
}
function getBestBid(symbol, depth) {
  return parseFloat(symbolsOrderBookInfoMap[symbol].bids[depth][0]);
}



function parseAsks (currentStrategy, depth) {
  const [buy, buy2, sell] = currentStrategy;

  return [
    symbolsOrderBookInfoMap[buy].asks[depth][0],
    symbolsOrderBookInfoMap[buy2].asks[depth][0],
    symbolsOrderBookInfoMap[sell].asks[depth][0]
  ].map(num => parseFloat(num));
}

function parseBids (currentStrategy, depth) {
  const [buy, buy2, sell] = currentStrategy;

  return [
    symbolsOrderBookInfoMap[buy].bids[depth][0],
    symbolsOrderBookInfoMap[buy2].bids[depth][0],
    symbolsOrderBookInfoMap[sell].bids[depth][0]
  ].map(num => parseFloat(num));
}

function parsePrices (currentStrategy, depth) {
  const [buy, buy2, sell] = currentStrategy;

  return [
    symbolsOrderBookInfoMap[buy].asks[depth][0],
    symbolsOrderBookInfoMap[buy2].asks[depth][0],
    symbolsOrderBookInfoMap[sell].bids[depth][0]
  ].map(num => parseFloat(num));
}

function parseSizes (currentStrategy, depth) {
  const [buy, buy2, sell] = currentStrategy;

  return [
    symbolsOrderBookInfoMap[buy].asks.slice(0, depth + 1).reduce((res, item ) => res + parseFloat(item[1]), 0),
    symbolsOrderBookInfoMap[buy2].asks.slice(0, depth + 1).reduce((res, item ) => res + parseFloat(item[1]), 0),
    symbolsOrderBookInfoMap[sell].bids.slice(0, depth + 1).reduce((res, item ) => res + parseFloat(item[1]), 0)
  ];
}

function getStringPrices (currentStrategy, depth) {
  const [buy, buy2, sell] = currentStrategy;
  return [
    symbolsOrderBookInfoMap[buy].asks[depth][0],
    symbolsOrderBookInfoMap[buy2].asks[depth][0],
    symbolsOrderBookInfoMap[sell].bids[depth][0]
  ];
}
const baseFirstStepAmount = 2;
const magicProfitRation = 0;



function calcSubProfit(coinId, orderBookDepth) {
  const allSymbolsArr = Object.keys(symbolsInfo);

  const possibleCoinsIdSymbols = getPossibleCancelSymbols(coinId);

  function getPossibleCancelSymbols(coinId) {
    return allSymbolsArr.map(key => {
      const [first, second] = key.split('-');
      if (first !== coinId) {
        return false;
      }

      if (second === 'USDT') {
        return [key];
      }

      if (!symbolsInfo[`${second}-USDT`]) {
        return false;
      }
      return [key, `${second}-USDT`];
    })
    .filter(symbol => {
      return symbol;
    });
  }

  function calcCancelStrategy (initialCoins, spend) {
    return possibleCoinsIdSymbols
      .map((cancelStrategy) => {
        if(!canCalc(cancelStrategy, orderBookDepth)) {
          return;
        }

        const { resultCoins, prices, fee } = cancelStrategy
          .reduce((res, symbol) => {
            const bestBidSymbol = getBestBid(symbol, orderBookDepth);
            const feeSymbol = parseFloat(tradeFees[symbol].takerFeeRate);

            res.prices.push(bestBidSymbol);
            res.resultCoins = res.resultCoins * bestBidSymbol;
            res.fee = res.fee + feeSymbol * baseFirstStepAmount;

            return res;

          }, {
            initialCoins,
            resultCoins: initialCoins,
            prices: [],
            fee: 0,
          });

        const result = resultCoins - fee;
        const profit = result - spend;

        return {
          result,
          profit,
          resultCoins,
          initialCoins,
          prices,
          fee,
          cancelStrategy,
        };
      })
      .filter(info => {
        return info.profit > 0;
      })
      .sort((a, b) => b.profit - a.profit);
  }

  return {
    possibleCoinsIdSymbols,
    calcCancelStrategy,
  };
}

function calcProfit(currentStrategy, orderBookDepth) {

    if (!canCalc(currentStrategy, orderBookDepth)) {
      return {};
    }

    const getActualPrices = () => {
      return parsePrices(currentStrategy, orderBookDepth);
    };
    const getActualSizes = () => {
      return parseSizes(currentStrategy, orderBookDepth);
    };

    const [buy, buy2, sell] = currentStrategy;
    const spend = baseFirstStepAmount;
    const fees = currentStrategy.map((pair) => parseFloat(tradeFees[pair].takerFeeRate));
    const approximateFees = fees.map((fee) => (fee * baseFirstStepAmount));
    const approximateFeeForThreeSteps = approximateFees.reduce((res, fee) => res + (fee), 0) * 1;
    const prices = getActualPrices();
    const fakePrices = [
      prices[0] * (1 + magicProfitRation),
      prices[1] * (1 + magicProfitRation),
      prices[2] * (1 - magicProfitRation)
    ];
    const stringPrices = getStringPrices(currentStrategy, orderBookDepth);
    const sizes = getActualSizes();
    const buyCoins = exactMath.div(spend, fakePrices[0]);

    if (buyCoins * 5 > sizes[0]) {
      return {};
    }

    const buy2Coins = exactMath.div(buyCoins, fakePrices[1]);

    if (buy2Coins * 5 > sizes[1]) {
      return {};
    }

    if (buy2Coins * 5 > sizes[2]) {
      return {};
    }

   const [buyCoinsId] = buy.split('-');
   const [buy2CoinsId] = buy2.split('-');


    const receive = exactMath.mul(buy2Coins, fakePrices[2]);
    const profit = receive - (spend + approximateFeeForThreeSteps);

    const multipliedFees = fees.map(fee => fee * 10);
    const cancelMultipliers = [1 + multipliedFees[0], 1 + multipliedFees[1], 1 - multipliedFees[2]];

    return {
      cancelPrices: [
        fakePrices[0] * cancelMultipliers[0],
        fakePrices[1] * cancelMultipliers[1],
        fakePrices[2] * cancelMultipliers[2]
      ],
      strategy: currentStrategy,
      orderBookDepth,
      baseFirstStepAmount,
      spend,
      fees,
      prices,
      fakePrices,
      approximateFees,
      subProfitOfBuyCoins: calcSubProfit(buyCoinsId, orderBookDepth),
      subProfitOfBuy2Coins: calcSubProfit(buy2CoinsId, orderBookDepth),
      getActualPrices,
      printPricesInfo: () => {
        const actualPrices = getActualPrices();
        currentStrategy.forEach((item, index) => {
          console.log(item);
          console.log('when started', prices[index]);
          console.log('current', actualPrices[index]);

          console.log('%',  actualPrices[index] / prices[index]);
          console.log('diff',  actualPrices[index] - prices[index]);
        });
      },
      stringPrices,
      sizes,
      buyCoins,
      buy2Coins,
      receive,
      approximateFeeForThreeSteps,
      profit,
      buyOrderBookInfo: symbolsOrderBookInfoMap[buy].asks[orderBookDepth][0],
      buy2OrderBookInfo: symbolsOrderBookInfoMap[buy2].asks[orderBookDepth][0],
      sellOrderBookInfo: symbolsOrderBookInfoMap[sell].bids[orderBookDepth][0]
    };
}


module.exports = {
  calcProfit,
  calcSubProfit,
};
