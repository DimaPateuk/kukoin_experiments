const { placeOrder } = require('./placeOrder');
const kucoin = require('./kucoin');
const { from, delay, switchMap, map, interval, tap } = require('rxjs');
const { v4 } = require('uuid');
const { infinitySocket } = require('./infinitySocket');


interval(10)
  .subscribe(console.log);
