const {processNumber} = require('./processNumber');

const available = 0.00007841103957572875;


setTimeout(() => {
const t = processNumber(available.toString(), 'CUDOS-BTC', 'buy')


console.log(t);

}, 3000)

