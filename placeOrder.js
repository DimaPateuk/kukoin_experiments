const kucoin = require('./kucoin')
const { v4 } = require('uuid');
const { Subject } = require('rxjs');

const placeOrderErrorSubject = new Subject();
function placeOrder(params) {
  let promise;
  if (params.stopPrice) {
    promise = kucoin.placeStopOrder({
      clientOid: v4(),
      type: 'market',
      ...params
    })
  } if (params.price) {
    promise = kucoin.placeOrder({
      clientOid: v4(),
      ...params
    })
  } else {
    promise = kucoin.placeOrder({
      clientOid: v4(),
      type: 'market',
      ...params
    });
  }

  return promise.then((res) => {
      if (res.code !== '200000') {
        placeOrderErrorSubject.next({
          params,
          res
        });
      }
      console.log(res, params);

      return res;

    }, (err) => {
      placeOrderErrorSubject.next({
        params,
        err,
      });
    });
}

module.exports = { placeOrder, placeOrderErrorSubject }
