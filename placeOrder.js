const kucoin = require('./kucoin');
const { Subject } = require('rxjs');

const placeOrderErrorSubject = new Subject();
function placeOrder(params, count = 0) {
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
    if (res.code === '200004' && count < 3) {
      console.log('retry of', params, count, 'because of', res);
      return placeOrder(params, count + 1);
    }
    if (res.code !== '200000') {
      placeOrderErrorSubject.next({
        params,
        res
      });

      console.log('tries', count, res, params);
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
