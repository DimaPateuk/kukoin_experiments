const kucoin = require('./kucoin')
const { v4 } = require('uuid');
const { Subject } = require('rxjs');

const placeOrderErrorSubject = new Subject();
function placeOrder(params) {

  return kucoin.placeOrder({
      clientOid: v4(),
      type: 'market',
      ...params
    })
    .then((res) => {
      console.log(params.symbol, res);

      if (res.code !== '200000') {
        placeOrderErrorSubject.next({
          params,
          res
        });
      }

      return res;

    }, (err) => {
      console.log(err);
      placeOrderErrorSubject.next({
        params,
        err,
      });
    });
}

module.exports = { placeOrder, placeOrderErrorSubject }
