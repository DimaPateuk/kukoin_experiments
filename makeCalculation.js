const kucoin = require('./kucoin')

kucoin.init({
  apiKey: process.env.apiKey,
  secretKey: process.env.secretKey,
  passphrase: process.env.passphrase,
  environment: 'live'
});


let subjectsMap = {
};


function getSubjects() {
  return Object.keys(subjectsMap.data);
}


function makeCalculation() {
  const subjects = getSubjects();
  const splittedSubjects = subjects
    .map(item => item.split('-'))

  const result = [];

  splittedSubjects
    .forEach((first) => {

      splittedSubjects
        .forEach((second) => {

          splittedSubjects
            .forEach((third) => {
              const firstInString = first.join('-');
              const secondInString = second.join('-');
              const thirdInString = third.join('-');

              if (firstInString === secondInString &&
                firstInString === thirdInString &&
                secondInString === thirdInString
              ) {
                return;
              }

              const way = [firstInString, secondInString, thirdInString];

              if (first[0] === second[1] && first[1] === third[1] && second[0] === third[0]) {
                result.push(way);
              }

            });

        });

    });
  const next = result.reduce((res, parts) => {
    res[parts.join(',')] = parts;

    return res;
  }, {})

  console.log(JSON.stringify(next, null, 4));

}


kucoin.getSymbols()
  .then((response) => {

    subjectsMap.data = response
      .data
      .reduce((res, item) => {

      res[item.symbol] = item;

      return res;

    }, {});

    makeCalculation();

  });

// kucoin.initSocket({ topic: "allTicker" }, (msg) => {
//   const parsedMessage = JSON.parse(msg);

//   subjectsMap[parsedMessage.subject] = parsedMessage.data;

//   makeCalculation();

// });


