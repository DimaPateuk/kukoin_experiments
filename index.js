require('dotenv').config()
const kucoin = require('./kucoin')
const { v4 } = require('uuid')
const exactMath = require('exact-math')
const strategies = require('./pairs');
const {
  takeWhile,
  Subject,
  tap,
  merge,
} = require('rxjs')

kucoin.init({
  apiKey: process.env.apiKey,
  secretKey: process.env.secretKey,
  passphrase: process.env.passphrase,
  environment: 'live'
});

const symbolsInfo = {};
kucoin.getSymbols()
  .then(response => {
    response
      .data
      .forEach(item => {
        symbolsInfo[item.symbol] = item;
      });
  });



function updateSubjectsInfo() {
  // return kucoin.getAllTickers()
  //   .then(response => {
  //     response
  //       .data
  //       .ticker
  //       .forEach(item => {
  //         subjectsMap[item.symbol] = {
  //           bestAsk: item.buy,
  //           bestBid: item.sell,
  //         }
  //       });
  //   });
}
updateSubjectsInfo();


const subjectsMap = {};
const ordersSubject = new Subject();
const balancesSubject = new Subject();

balancesSubject
  .subscribe(({balance}) => {
    if (balance.currency !== 'USDT') {
      return;
    }

    console.log('USDT', balance.available);
  });

function placeOrder(params) {

  return kucoin.placeOrder({
      clientOid: v4(),
      type: 'market',
      ...params
    })
    .then((res) => {
      console.log(params.symbol, res);

      // if (res.code === '200004') {
      //   console.log(params);
      //   return placeOrder(params);
      // }

      return res;

    }, (err) => {
      console.log(err);
    });
}

const currenciesMap = {};
kucoin.getCurrencies()
  .then(response => {
    response.data
      .forEach(item => {
        currenciesMap[item.currency] = item;
      });
  });

const accountsInfo = {};
kucoin.getAccounts()
  .then(response => {
    account.data = response.data;

    console.log(accountsInfo.data);
  })

const MYbaseFee = 0.01;
function processNumber(strNumber, pair, type) {
  // const { myFeeMul } = tradeFeesMap[pair];
  // const num = parseFloat(strNumber);
  const num = exactMath.mul(parseFloat(strNumber), exactMath.add(1, -0.005));
  const [beforeDot, afterDot] = num.toString().split('.');

  if (!afterDot) {
    return strNumber;
  }

  const amount = type === 'buy' ? symbolsInfo[pair].quoteIncrement : symbolsInfo[pair].baseIncrement;
  const countNumbersAfterDot = amount.split('.')[1].length;

  return `${beforeDot}.${afterDot.substring(0, countNumbersAfterDot)}`;
}

let oneStrategyInProgress = false;

let count = 0;

function startStrategy(currentStrategy) {
  oneStrategyInProgress = true;

  const [buy, buy2, sell] = currentStrategy;

  console.log(currentStrategy, '---- started');

  placeOrder({
    side: 'buy',
    symbol: buy,
    funds: '1',
  });

  const doneOrder = [];
  const availableMap = {};
  let step = 1;

  merge(ordersSubject, balancesSubject)
    .pipe(
      tap(event => {
        if (event.order) {
          doneOrder.push(event.order);
        }

        if (event.balance) {
          availableMap[event.balance.currency] = parseFloat(event.balance.available);
        }
      }),
      tap(() => {
        if (doneOrder.length !== 1 || step !== 1) {
          return;
        }

        const order = doneOrder[0];
        const filledSize = parseFloat(order.filledSize);
        const currency = order.symbol.split('-')[0];
        const available = availableMap[currency];

        if (!available) {
          return;
        }

        if (filledSize > available) {
          return;
        }

        step++;

        console.log('price', order.price);
        console.log('buy2', processNumber(order.filledSize, buy2, 'buy'));
        placeOrder({
          side: 'buy',
          symbol: buy2,
          funds: processNumber(order.filledSize, buy2, 'buy'),
        });
      }),
      tap(() => {
        if (doneOrder.length !== 2 || step !== 2) {
          return;
        }

        const order = doneOrder[1];
        const filledSize = parseFloat(order.filledSize);
        const currency = order.symbol.split('-')[0];
        const available = availableMap[currency];

        if (!available) {
          return;
        }

        if (filledSize > available) {
          return;
        }

        step++;

        console.log('price', order.price);
        console.log('sell', processNumber(order.filledSize, sell, 'sell'));
        placeOrder({
          side: 'sell',
          symbol: sell,
          size: processNumber(order.filledSize, sell, 'sell'),
        });
      }),
      tap(() => {
        if (doneOrder.length !== 3 || step !== 3) {
          return;
        }

        console.log('price', doneOrder[2].price);
        step++;
        console.log('strategy end', currentStrategy);

        // count++;
        // if (count < 5) {
        //   oneStrategyInProgress = false;
        // }

      }),
      takeWhile(() => {
        return step < 4;
      }),
    )
    .subscribe();
}

setTimeout(() => {
  kucoin.initSocket({ topic: "allTicker" }, (msg) => {
    const parsedMessage = JSON.parse(msg);
  
    subjectsMap[parsedMessage.subject] = parsedMessage.data;
  
    makeCalculation();
  
  }, () => {
    Object
      .keys(subjectsMap)
      .forEach(key => {
        delete subjectsMap[key];
      });
  }, () => {
    updateSubjectsInfo();
  });
},1000);


kucoin.initSocket({ topic: "orders" }, (msg) => {
  const parsedMessage = JSON.parse(msg);

  if (parsedMessage.topic !== "/spotMarket/tradeOrders") {
    return;
  }

  const { data } = parsedMessage;

  if (data.status === 'done') {
    ordersSubject.next({ order: data });
  }
});

kucoin.initSocket({ topic: "balances" }, (msg) => {
  const parsedMessage = JSON.parse(msg);

  if (parsedMessage.topic !== "/account/balance") {
    return;
  }

  const { data } = parsedMessage;
  balancesSubject.next({ balance: data });
});

function makeCalculation() {
  if (oneStrategyInProgress) {
    return;
  }

  // startStrategy([ 'TRX-USDT', 'KLV-TRX', 'KLV-USDT' ]);

  // return;

  const strategiesArray = Object.keys(strategies);

  strategiesArray
    .forEach((strategyName) => {
      const currentStrategy = strategies[strategyName];
      const [buy, buy2, sell] = currentStrategy;

      if(buy.split('-')[1] !== 'USDT') {
        return;
      }

      if (oneStrategyInProgress) {
        return;
      }

      if (
        !subjectsMap[buy]?.bestBid ||
        !subjectsMap[buy2]?.bestBid ||
        !subjectsMap[sell]?.bestAsk
      ) {
        return;
      }
      const pricesFlow = [
        subjectsMap[buy].bestAsk,
        subjectsMap[buy2].bestAsk,
        subjectsMap[sell].bestBid
      ].map(num => parseFloat(num));

      const prices = [
        pricesFlow[0],
        pricesFlow[1],
        pricesFlow[2]
      ];

      const spend = prices[0];
      const spend2 = exactMath.div(1 - MYbaseFee, exactMath.mul(prices[1],  1 + MYbaseFee));
      const receive = exactMath.mul(exactMath.mul(spend2, 1 - MYbaseFee), prices[2]);

      if (receive - spend < 0) {
        return;
      }
      console.log(prices);
      startStrategy(currentStrategy);
    });
}

