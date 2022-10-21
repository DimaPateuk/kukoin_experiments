const kucoin = require('./kucoin');
const { Subject } = require('rxjs');

const placeOrderErrorSubject = new Subject();
function placeOrder(params) {
  let promise;
  if (params.stopPrice) {
    promise = kucoin.placeStopOrder({
      type: 'market',
      ...params
    })
  } if (params.price) {
    promise = kucoin.placeOrder({
      ...params
    })
  } else {
    promise = kucoin.placeOrder({
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
        console.log(res, params);
        process.exit(1);

      }
      return res;

    }, (err) => {
      console.log(err, params);
      placeOrderErrorSubject.next({
        params,
        err,
      });

      process.exit(1);
    });
}

module.exports = { placeOrder, placeOrderErrorSubject }
