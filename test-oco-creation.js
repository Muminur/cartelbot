const axios = require('axios');
const crypto = require('crypto');

// RAD Signal Data
const SIGNAL = {
  symbol: 'RADUSDT',
  buyQuantity: 233.6,  // From trade 14148
  entryPrice: 0.428,   // From trade (this seems wrong!)
  targets: [0.704, 0.730, 0.760, 0.814, 0.880],
  stopLoss: 0.605,
  distribution: [75, 15, 10]  // 3 OCO orders max
};

const TESTNET = true;
const API_KEY = 'YOUR_TESTNET_API_KEY';
const API_SECRET = 'YOUR_TESTNET_API_SECRET';
const BASE_URL = TESTNET
  ? 'https://testnet.binance.vision'
  : 'https://api.binance.com';

function createSignature(queryString, apiSecret) {
  return crypto
    .createHmac('sha256', apiSecret)
    .update(queryString)
    .digest('hex');
}

async function getExchangeInfo(symbol) {
  try {
    const response = await axios.get(`${BASE_URL}/api/v3/exchangeInfo`, {
      params: { symbol }
    });

    const symbolInfo = response.data.symbols[0];
    console.log('\n=== EXCHANGE INFO for', symbol, '===');
    console.log('Status:', symbolInfo.status);
    console.log('Filters:', JSON.stringify(symbolInfo.filters, null, 2));

    return symbolInfo;
  } catch (error) {
    console.error('Error fetching exchange info:', error.response?.data || error.message);
    throw error;
  }
}

async function getCurrentPrice(symbol) {
  try {
    const response = await axios.get(`${BASE_URL}/api/v3/ticker/24hr`, {
      params: { symbol }
    });
    console.log('\n=== CURRENT PRICE ===');
    console.log('Last Price:', response.data.lastPrice);
    console.log('24h Change:', response.data.priceChangePercent, '%');
    return parseFloat(response.data.lastPrice);
  } catch (error) {
    console.error('Error fetching price:', error.response?.data || error.message);
    throw error;
  }
}

function validateFilters(price, quantity, filters) {
  const errors = [];

  // PRICE_FILTER
  const priceFilter = filters.find(f => f.filterType === 'PRICE_FILTER');
  if (priceFilter) {
    const { minPrice, maxPrice, tickSize } = priceFilter;
    console.log('\nPRICE_FILTER:', priceFilter);

    if (price < parseFloat(minPrice)) {
      errors.push(`Price ${price} below min ${minPrice}`);
    }
    if (price > parseFloat(maxPrice)) {
      errors.push(`Price ${price} above max ${maxPrice}`);
    }

    // Check tick size precision
    const tickSizePrecision = tickSize.split('.')[1]?.replace(/0+$/, '').length || 0;
    const pricePrecision = price.toString().split('.')[1]?.length || 0;
    if (pricePrecision > tickSizePrecision) {
      errors.push(`Price precision ${pricePrecision} exceeds tick size precision ${tickSizePrecision}`);
    }
  }

  // LOT_SIZE
  const lotSizeFilter = filters.find(f => f.filterType === 'LOT_SIZE');
  if (lotSizeFilter) {
    const { minQty, maxQty, stepSize } = lotSizeFilter;
    console.log('\nLOT_SIZE:', lotSizeFilter);

    if (quantity < parseFloat(minQty)) {
      errors.push(`Quantity ${quantity} below min ${minQty}`);
    }
    if (quantity > parseFloat(maxQty)) {
      errors.push(`Quantity ${quantity} above max ${maxQty}`);
    }

    // Check step size precision
    const stepSizePrecision = stepSize.split('.')[1]?.replace(/0+$/, '').length || 0;
    const qtyPrecision = quantity.toString().split('.')[1]?.length || 0;
    if (qtyPrecision > stepSizePrecision) {
      errors.push(`Quantity precision ${qtyPrecision} exceeds step size precision ${stepSizePrecision}`);
    }
  }

  // MIN_NOTIONAL
  const minNotionalFilter = filters.find(f => f.filterType === 'MIN_NOTIONAL');
  const notionalFilter = filters.find(f => f.filterType === 'NOTIONAL');
  const notional = price * quantity;

  if (minNotionalFilter) {
    console.log('\nMIN_NOTIONAL:', minNotionalFilter);
    const minNotional = parseFloat(minNotionalFilter.minNotional);
    if (notional < minNotional) {
      errors.push(`Notional ${notional.toFixed(8)} below min ${minNotional}`);
    }
  }

  if (notionalFilter) {
    console.log('\nNOTIONAL:', notionalFilter);
    const minNotional = parseFloat(notionalFilter.minNotional);
    const maxNotional = parseFloat(notionalFilter.maxNotional);
    if (notional < minNotional) {
      errors.push(`Notional ${notional.toFixed(8)} below min ${minNotional}`);
    }
    if (notional > maxNotional) {
      errors.push(`Notional ${notional.toFixed(8)} above max ${maxNotional}`);
    }
  }

  return errors;
}

function simulateOCOOrders() {
  console.log('\n=== SIMULATING OCO ORDER CREATION ===');
  console.log('Signal:', SIGNAL);

  // Take first 3 targets based on distribution
  const maxTargets = SIGNAL.distribution.length;
  const targets = SIGNAL.targets.slice(0, maxTargets);

  console.log(`\nUsing ${targets.length} targets out of ${SIGNAL.targets.length}:`);

  for (let i = 0; i < targets.length; i++) {
    const targetPrice = targets[i];
    const percentage = SIGNAL.distribution[i];
    const qtyForTarget = (SIGNAL.buyQuantity * percentage) / 100;

    console.log(`\nTarget ${i + 1}:`);
    console.log('  Price:', targetPrice);
    console.log('  Quantity:', qtyForTarget.toFixed(8), `(${percentage}%)`);
    console.log('  Stop Loss:', SIGNAL.stopLoss);
    console.log('  Stop Limit Price:', (SIGNAL.stopLoss * 0.995).toFixed(8), '(0.5% below SL)');
    console.log('  Notional:', (targetPrice * qtyForTarget).toFixed(2), 'USDT');
  }

  // Check allocation
  const totalAllocated = SIGNAL.distribution.reduce((sum, pct) => sum + pct, 0);
  console.log(`\nTotal Allocation: ${totalAllocated}%`);

  if (totalAllocated !== 100) {
    console.warn(`⚠️  WARNING: Allocation is ${totalAllocated}%, not 100%!`);
  }

  const allocatedQty = targets.reduce((sum, _, i) => {
    return sum + (SIGNAL.buyQuantity * SIGNAL.distribution[i]) / 100;
  }, 0);

  console.log(`Buy Quantity: ${SIGNAL.buyQuantity}`);
  console.log(`Allocated Quantity: ${allocatedQty.toFixed(8)}`);
  console.log(`Unallocated: ${(SIGNAL.buyQuantity - allocatedQty).toFixed(8)}`);
}

async function testOCOCreation() {
  try {
    console.log('Testing OCO Order Creation for RADUSDT');
    console.log('Using', TESTNET ? 'TESTNET' : 'MAINNET');

    // Get exchange info
    const symbolInfo = await getExchangeInfo(SIGNAL.symbol);

    // Get current price
    const currentPrice = await getCurrentPrice(SIGNAL.symbol);

    // Compare with entry price from trade
    console.log('\n=== ENTRY PRICE ANALYSIS ===');
    console.log('Current Price:', currentPrice);
    console.log('Entry Price (from trade):', SIGNAL.entryPrice);
    console.log('Signal Entry Range: 0.677 - 0.68');
    console.log('Difference:', ((currentPrice - SIGNAL.entryPrice) / SIGNAL.entryPrice * 100).toFixed(2), '%');

    if (Math.abs(currentPrice - SIGNAL.entryPrice) / SIGNAL.entryPrice > 0.5) {
      console.warn('⚠️  WARNING: Entry price from trade differs significantly from current price!');
      console.warn('⚠️  This suggests the entry price in the database might be incorrect.');
    }

    // Simulate OCO orders
    simulateOCOOrders();

    // Validate each target
    console.log('\n=== VALIDATING TARGETS AGAINST FILTERS ===');
    for (let i = 0; i < 3; i++) {
      const targetPrice = SIGNAL.targets[i];
      const percentage = SIGNAL.distribution[i];
      const qtyForTarget = (SIGNAL.buyQuantity * percentage) / 100;

      console.log(`\nTarget ${i + 1}: ${targetPrice} (${qtyForTarget.toFixed(8)} RAD)`);

      // Validate target price
      const targetErrors = validateFilters(targetPrice, qtyForTarget, symbolInfo.filters);
      if (targetErrors.length > 0) {
        console.error('  ❌ ERRORS:', targetErrors);
      } else {
        console.log('  ✅ Target price validation passed');
      }

      // Validate stop loss
      const stopErrors = validateFilters(SIGNAL.stopLoss, qtyForTarget, symbolInfo.filters);
      if (stopErrors.length > 0) {
        console.error('  ❌ Stop Loss ERRORS:', stopErrors);
      } else {
        console.log('  ✅ Stop loss validation passed');
      }

      // Validate stop limit price
      const stopLimitPrice = SIGNAL.stopLoss * 0.995;
      const stopLimitErrors = validateFilters(stopLimitPrice, qtyForTarget, symbolInfo.filters);
      if (stopLimitErrors.length > 0) {
        console.error('  ❌ Stop Limit ERRORS:', stopLimitErrors);
      } else {
        console.log('  ✅ Stop limit validation passed');
      }
    }

    console.log('\n=== ANALYSIS COMPLETE ===');
    console.log('\nPossible Issues:');
    console.log('1. Entry price discrepancy ($0.428 vs expected ~$0.677)');
    console.log('2. OCO orders timing out (30 seconds)');
    console.log('3. Filter validation failures');
    console.log('4. Price precision issues (tick size)');
    console.log('\nCheck server logs for actual Binance API error responses.');

  } catch (error) {
    console.error('Test failed:', error);
  }
}

testOCOCreation();
