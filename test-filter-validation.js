// Simulate the exact validation flow in trade-executor.ts

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

function validateAllFilters(price, quantity, tickSize, stepSize) {
  const adjustedPrice = formatPriceByTickSize(price, tickSize);
  const adjustedQuantity = formatQuantity(quantity, stepSize);
  return { adjustedPrice, adjustedQuantity };
}

// RAD Signal Data
const tickSize = '0.00100000';
const stepSize = '0.10000000';
const buyQuantity = 233.6;
const distribution = [75, 15, 10];
const targets = [0.704, 0.730, 0.760];
const stopLoss = 0.605;

console.log('=== SIMULATING trade-executor.ts FLOW ===\n');

for (let i = 0; i < 3; i++) {
  const targetPrice = targets[i];
  const percentage = distribution[i];
  const qtyForTarget = (buyQuantity * percentage) / 100;

  console.log(`Target ${i}:`);
  console.log('  Original Target Price:', targetPrice);
  console.log('  Original Quantity:', qtyForTarget);

  // Validate and adjust target price and quantity (line 296)
  const validation = validateAllFilters(targetPrice, qtyForTarget, tickSize, stepSize);
  const adjustedQty = validation.adjustedQuantity;
  const adjustedPrice = validation.adjustedPrice;

  console.log('  Adjusted Target Price:', adjustedPrice);
  console.log('  Adjusted Quantity:', adjustedQty);

  // Validate and adjust stop loss price (line 306)
  const stopPriceValidation = validateAllFilters(stopLoss, adjustedQty, tickSize, stepSize);
  const adjustedStopPrice = stopPriceValidation.adjustedPrice;

  console.log('  Adjusted Stop Price:', adjustedStopPrice);

  // Calculate and validate stop limit price (0.5% below stop loss) (line 310)
  const rawStopLimitPrice = adjustedStopPrice * 0.995;
  console.log('  Raw Stop Limit Price (SL * 0.995):', rawStopLimitPrice);

  const stopLimitValidation = validateAllFilters(rawStopLimitPrice, adjustedQty, tickSize, stepSize);
  const adjustedStopLimitPrice = stopLimitValidation.adjustedPrice;

  console.log('  Adjusted Stop Limit Price:', adjustedStopLimitPrice);

  // Now these values go to client.createOCOOrder()
  console.log('  Values sent to BinanceClient:');
  console.log('    symbol: RADUSDT');
  console.log('    quantity:', adjustedQty);
  console.log('    price (target):', adjustedPrice);
  console.log('    stopPrice (stop loss):', adjustedStopPrice);
  console.log('    stopLimitPrice:', adjustedStopLimitPrice);
  console.log('');
}

console.log('=== VERIFICATION ===');
console.log('All prices should have 3 decimal places (tick size)');
console.log('All quantities should have 1 decimal place (step size)');
console.log('Stop limit price calculation: 0.605 * 0.995 =', 0.605 * 0.995);
console.log('Rounded to 3 decimals:', formatPriceByTickSize(0.605 * 0.995, tickSize));
