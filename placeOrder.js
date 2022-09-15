const kucoin = require('./kucoin')
const { v4 } = require('uuid');

function placeOrder(params) {

  return kucoin.placeOrder({
      clientOid: v4(),
      type: 'market',
      ...params
    })
    .then((res) => {
      console.log(params.symbol, res);

      return res;

    }, (err) => {
      console.log(err);
    });
}

module.exports = { placeOrder }
