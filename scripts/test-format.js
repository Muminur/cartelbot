/**
 * Test script for format utilities
 */

function formatPrice(price, decimals = 8) {
  return price.toFixed(decimals).replace(/\.?0+$/, "");
}

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

function formatPercentage(value, decimals = 2) {
  return `${(value * 100).toFixed(decimals)}%`;
}

function formatUSDT(amount) {
  return `${amount.toFixed(2)} USDT`;
}

function formatSymbol(symbol) {
  if (symbol.endsWith("USDT")) {
    return symbol.replace("USDT", "");
  }
  return symbol;
}

function parseSymbolToUsdt(symbol) {
  const cleaned = symbol.replace(/[\$\s]/g, "").toUpperCase();
  if (cleaned.endsWith("USDT")) {
    return cleaned;
  }
  return `${cleaned}USDT`;
}

// Test suite
console.log("🧪 Testing Format Utilities...\n");

let testsPassed = 0;
let testsFailed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✅ ${name}`);
    testsPassed++;
  } catch (error) {
    console.error(`❌ ${name}`);
    console.error(`   Error: ${error.message}`);
    testsFailed++;
  }
}

// Test formatPrice
test("formatPrice - basic", () => {
  const result = formatPrice(1.23456789);
  if (result !== "1.23456789") {
    throw new Error(`Expected '1.23456789', got '${result}'`);
  }
});

test("formatPrice - remove trailing zeros", () => {
  const result = formatPrice(1.20000000);
  if (result !== "1.2") {
    throw new Error(`Expected '1.2', got '${result}'`);
  }
});

test("formatPrice - whole number", () => {
  const result = formatPrice(100.00000000);
  if (result !== "100") {
    throw new Error(`Expected '100', got '${result}'`);
  }
});

test("formatPrice - with decimals parameter", () => {
  const result = formatPrice(1.23456789, 4);
  if (result !== "1.2346") {
    throw new Error(`Expected '1.2346', got '${result}'`);
  }
});

// Test formatQuantity
test("formatQuantity - stepSize 0.00100000", () => {
  const result = formatQuantity(1.23456, "0.00100000");
  if (result !== 1.234) {
    throw new Error(`Expected 1.234, got ${result}`);
  }
});

test("formatQuantity - stepSize 1.00000000", () => {
  const result = formatQuantity(5.7, "1.00000000");
  if (result !== 5) {
    throw new Error(`Expected 5, got ${result}`);
  }
});

test("formatQuantity - stepSize 0.10000000", () => {
  const result = formatQuantity(3.456, "0.10000000");
  if (result !== 3.4) {
    throw new Error(`Expected 3.4, got ${result}`);
  }
});

test("formatQuantity - stepSize 0.01000000", () => {
  const result = formatQuantity(10.987, "0.01000000");
  if (result !== 10.98) {
    throw new Error(`Expected 10.98, got ${result}`);
  }
});

// Test formatPriceByTickSize
test("formatPriceByTickSize - tickSize 0.00100000", () => {
  const result = formatPriceByTickSize(1.23456, "0.00100000");
  if (result !== 1.235) {
    throw new Error(`Expected 1.235, got ${result}`);
  }
});

test("formatPriceByTickSize - tickSize 0.01000000", () => {
  const result = formatPriceByTickSize(10.987, "0.01000000");
  if (result !== 10.99) {
    throw new Error(`Expected 10.99, got ${result}`);
  }
});

test("formatPriceByTickSize - tickSize 1.00000000", () => {
  const result = formatPriceByTickSize(5.7, "1.00000000");
  if (result !== 6) {
    throw new Error(`Expected 6, got ${result}`);
  }
});

// Test formatPercentage
test("formatPercentage - basic", () => {
  const result = formatPercentage(0.1234);
  if (result !== "12.34%") {
    throw new Error(`Expected '12.34%', got '${result}'`);
  }
});

test("formatPercentage - whole number", () => {
  const result = formatPercentage(1);
  if (result !== "100.00%") {
    throw new Error(`Expected '100.00%', got '${result}'`);
  }
});

test("formatPercentage - custom decimals", () => {
  const result = formatPercentage(0.123456, 4);
  if (result !== "12.3456%") {
    throw new Error(`Expected '12.3456%', got '${result}'`);
  }
});

test("formatPercentage - negative", () => {
  const result = formatPercentage(-0.05);
  if (result !== "-5.00%") {
    throw new Error(`Expected '-5.00%', got '${result}'`);
  }
});

// Test formatUSDT
test("formatUSDT - basic", () => {
  const result = formatUSDT(100.5);
  if (result !== "100.50 USDT") {
    throw new Error(`Expected '100.50 USDT', got '${result}'`);
  }
});

test("formatUSDT - whole number", () => {
  const result = formatUSDT(50);
  if (result !== "50.00 USDT") {
    throw new Error(`Expected '50.00 USDT', got '${result}'`);
  }
});

test("formatUSDT - with many decimals", () => {
  const result = formatUSDT(123.456789);
  if (result !== "123.46 USDT") {
    throw new Error(`Expected '123.46 USDT', got '${result}'`);
  }
});

// Test formatSymbol
test("formatSymbol - BTCUSDT", () => {
  const result = formatSymbol("BTCUSDT");
  if (result !== "BTC") {
    throw new Error(`Expected 'BTC', got '${result}'`);
  }
});

test("formatSymbol - ETHUSDT", () => {
  const result = formatSymbol("ETHUSDT");
  if (result !== "ETH") {
    throw new Error(`Expected 'ETH', got '${result}'`);
  }
});

test("formatSymbol - without USDT", () => {
  const result = formatSymbol("BTC");
  if (result !== "BTC") {
    throw new Error(`Expected 'BTC', got '${result}'`);
  }
});

// Test parseSymbolToUsdt
test("parseSymbolToUsdt - $BTC", () => {
  const result = parseSymbolToUsdt("$BTC");
  if (result !== "BTCUSDT") {
    throw new Error(`Expected 'BTCUSDT', got '${result}'`);
  }
});

test("parseSymbolToUsdt - BTC", () => {
  const result = parseSymbolToUsdt("BTC");
  if (result !== "BTCUSDT") {
    throw new Error(`Expected 'BTCUSDT', got '${result}'`);
  }
});

test("parseSymbolToUsdt - btc (lowercase)", () => {
  const result = parseSymbolToUsdt("btc");
  if (result !== "BTCUSDT") {
    throw new Error(`Expected 'BTCUSDT', got '${result}'`);
  }
});

test("parseSymbolToUsdt - BTCUSDT (already formatted)", () => {
  const result = parseSymbolToUsdt("BTCUSDT");
  if (result !== "BTCUSDT") {
    throw new Error(`Expected 'BTCUSDT', got '${result}'`);
  }
});

test("parseSymbolToUsdt - $BTC with space", () => {
  const result = parseSymbolToUsdt("$ BTC");
  if (result !== "BTCUSDT") {
    throw new Error(`Expected 'BTCUSDT', got '${result}'`);
  }
});

test("parseSymbolToUsdt - $NEAR", () => {
  const result = parseSymbolToUsdt("$NEAR");
  if (result !== "NEARUSDT") {
    throw new Error(`Expected 'NEARUSDT', got '${result}'`);
  }
});

test("parseSymbolToUsdt - multiple symbols with $", () => {
  const result = parseSymbolToUsdt("$MLN");
  if (result !== "MLNUSDT") {
    throw new Error(`Expected 'MLNUSDT', got '${result}'`);
  }
});

console.log("\n" + "=".repeat(50));
console.log(`Tests passed: ${testsPassed}`);
console.log(`Tests failed: ${testsFailed}`);
console.log("=".repeat(50));

if (testsFailed > 0) {
  process.exit(1);
}

console.log("\n✅ All format tests passed!");
