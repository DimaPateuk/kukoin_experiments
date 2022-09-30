const { placeOrder } = require('./placeOrder');
const { v4 } = require('uuid');
placeOrder({
  clientOid: v4(),
  side: 'sell',
  symbol: 'TARA-USDT',
  funds: '1.508',
});
