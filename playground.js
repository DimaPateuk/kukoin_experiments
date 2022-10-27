const { v4 } = require('uuid');



setInterval(() => {
  console.log(v4());
}, 5000);
