
function priceDiff(one, two) {
  return (Math.min(one, two))/(Math.max(one,two)) * 100;
}

module.exports = { priceDiff }
