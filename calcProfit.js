const exactMath = require('exact-math');
const tradeFees = require('./tradeFees');
const { symbolsOrderBookInfoMap, symbolsInfo } = require('./resources');

Object
  .keys(tradeFees)
  .forEach(key => {
    if (tradeFees[key].takerFeeRate === '0') {
      tradeFees[key].takerFeeRate = '0.002';
    }

    if (tradeFees[key].makerFeeRate === '0') {
      tradeFees[key].makerFeeRate = '0.002';
    }
  });


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

function parsePrices (currentStrategy, depth) {
  return getStringPrices(currentStrategy, depth)
    .map(num => parseFloat(num));
}

function parseSizes (currentStrategy, depth) {
  const [buy, buy2, sell] = currentStrategy;

  return [
    symbolsOrderBookInfoMap[buy].asks.slice(0, depth + 1).reduce((res, item ) => res + parseFloat(item[1]), 0),
    symbolsOrderBookInfoMap[sell].asks.slice(0, depth + 1).reduce((res, item ) => res + parseFloat(item[1]), 0),
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
    const approximateFeeForThreeSteps = approximateFees.reduce((res, fee) => res + (fee), 0) * 0;
    const actualPrices = getActualPrices();
    const stringPrices = getStringPrices(currentStrategy, orderBookDepth);
    const sizes = getActualSizes();
    const buyCoins = exactMath.div(spend, getBestAsk(buy, orderBookDepth));
    const sellCoins = exactMath.div(spend, getBestAsk(sell, orderBookDepth))

    const initialBuyBestAsk = getBestAsk(buy, orderBookDepth);
    const initialSellBestAsk = getBestAsk(sell, orderBookDepth);
    return {
      strategy: currentStrategy,
      orderBookDepth,
      baseFirstStepAmount,
      spend,
      fees,
      actualPrices,
      approximateFees,
      printPricesInfo: () => {
        const currentBuyBestBid = getBestBid(buy, orderBookDepth);
        const currentSellBestBid = getBestBid(sell, orderBookDepth);

        console.log(buy, sell);

        console.log('Buy symbol', initialBuyBestAsk, currentBuyBestBid, initialBuyBestAsk / currentBuyBestBid, initialBuyBestAsk - currentBuyBestBid);
        console.log('Sell symbol', initialSellBestAsk, currentSellBestBid, initialSellBestAsk / currentSellBestBid, initialSellBestAsk - currentSellBestBid);
        console.log('buyCoins', buyCoins);
        console.log('sellCoins', sellCoins);
        const currentBuyCoins =  currentBuyBestBid * buyCoins;
        const currentSellCoins = currentSellBestBid * sellCoins;

        console.log('coins buy, sell', currentBuyCoins, currentSellCoins);

        const buySellRatio =  currentBuyCoins / currentSellCoins;
        const sellBuyRatio =  currentSellCoins / currentBuyCoins;


        console.log('buy/sell', buySellRatio);
        console.log('sell/buy', sellBuyRatio);
        console.log('sell as bought', currentBuyCoins + currentSellCoins - 2 * (spend + approximateFees[0] + approximateFees[2]));

        const transformByBuy2OfBuyToSell = buyCoins / getBestAsk(buy2, orderBookDepth);
        const transformByBuy2OfBuyToSellResult = (transformByBuy2OfBuyToSell + sellCoins) * currentSellBestBid - approximateFees[2] * 2 - approximateFees[1];
        const transformByBuy2OfSellToBuy = sellCoins * getBestBid(buy2, orderBookDepth);
        const transformByBuy2OfSellToBuyResult = (transformByBuy2OfSellToBuy + buyCoins) * currentBuyBestBid - approximateFees[0] * 2 - approximateFees[1];

        console.log('buy2 ask transform', transformByBuy2OfBuyToSellResult - spend * 2);
        console.log('buy2 bid transform', transformByBuy2OfSellToBuyResult - spend * 2);


      },
      stringPrices,
      sizes,
      buyCoins,
      sellCoins,
      approximateFeeForThreeSteps,
      initialBuyBestAsk,
      initialSellBestAsk,
    };
}


module.exports = {
  calcProfit,
  getBestBid,
  getBestAsk,
};
