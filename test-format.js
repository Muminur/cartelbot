// Test format functions
function formatQuantity(quantity, stepSize) {
  const decimalIndex = stepSize.indexOf(".");
  const oneIndex = stepSize.indexOf("1");

  if (decimalIndex === -1 || oneIndex < decimalIndex) {
    return Math.floor(quantity);
  }

  const precision = oneIndex - decimalIndex;
  const multiplier = Math.pow(10, precision);
  return Math.floor(quantity * multiplier) / multiplier;
}

function formatPriceByTickSize(price, tickSize) {
  const decimalIndex = tickSize.indexOf(".");
  const oneIndex = tickSize.indexOf("1");

  if (decimalIndex === -1 || oneIndex < decimalIndex) {
    return Math.round(price);
  }

  const precision = oneIndex - decimalIndex;
  const multiplier = Math.pow(10, precision);
  return Math.round(price * multiplier) / multiplier;
}

// Test with RADUSDT filters
const tickSize = '0.00100000';
const stepSize = '0.10000000';

console.log('=== RADUSDT FILTERS ===');
console.log('Tick Size:', tickSize);
console.log('Step Size:', stepSize);

console.log('\n=== TESTING PRICES ===');
const prices = [0.704, 0.73, 0.76, 0.605, 0.60197500];
prices.forEach(price => {
  const formatted = formatPriceByTickSize(price, tickSize);
  console.log(`${price} → ${formatted}`);
});

console.log('\n=== TESTING QUANTITIES ===');
const quantities = [233.6, 175.20, 35.04, 23.36];
quantities.forEach(qty => {
  const formatted = formatQuantity(qty, stepSize);
  console.log(`${qty} → ${formatted}`);
});

console.log('\n=== PRECISION CALCULATION ===');
const tickDecimalIndex = tickSize.indexOf(".");
const tickOneIndex = tickSize.indexOf("1");
const tickPrecision = tickOneIndex - tickDecimalIndex;
console.log('Tick Size "0.00100000":');
console.log('  Decimal index:', tickDecimalIndex);
console.log('  "1" index:', tickOneIndex);
console.log('  Precision:', tickPrecision);
console.log('  Multiplier:', Math.pow(10, tickPrecision));

const stepDecimalIndex = stepSize.indexOf(".");
const stepOneIndex = stepSize.indexOf("1");
const stepPrecision = stepOneIndex - stepDecimalIndex;
console.log('Step Size "0.10000000":');
console.log('  Decimal index:', stepDecimalIndex);
console.log('  "1" index:', stepOneIndex);
console.log('  Precision:', stepPrecision);
console.log('  Multiplier:', Math.pow(10, stepPrecision));
