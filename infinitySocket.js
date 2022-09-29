const kucoin = require('./kucoin');

function infinitySocket (params, handler, oldWs) {
  kucoin
  .create()
  .initSocket(
    params,
    handler,
    (ws) => {
      if (oldWs) {
        oldWs.terminate();
      }

      setTimeout(() => {
        infinitySocket(params, handler, ws);
      }, 60000);
    }
  )
}

//example

// infinitySocket(
//   { topic: "depth50", symbols: symbolsByTrackers[0] },
//   (msg) => {
//     const parsedMessage = JSON.parse(msg);
//     const symbol = parsedMessage?.topic?.split(':')[1];
//     if (!symbol) {
//       return;
//     }

//     symbolsOrderBookInfoMap[symbol] = parsedMessage.data;
//   }
// )



module.exports = { infinitySocket };
