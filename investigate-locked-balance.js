/**
 * DIAGNOSTIC SCRIPT: Investigate Locked Balance Mystery
 *
 * This script investigates why 0.00196 BTC is locked when only 0.00103 BTC should be.
 *
 * Key Questions:
 * 1. Are there phantom open orders from previous failed OCO attempts?
 * 2. What's the difference between locked balance and buy order quantity?
 * 3. Are old OCO orders still OPEN on Binance even though our code thinks they failed?
 */

const axios = require('axios');
const crypto = require('crypto');
require('dotenv').config();

// REPLACE WITH YOUR TESTNET API CREDENTIALS
const API_KEY = 'YOUR_TESTNET_API_KEY';
const API_SECRET = 'YOUR_TESTNET_API_SECRET';
const BASE_URL = 'https://testnet.binance.vision';

// REPLACE WITH THE SYMBOL FROM YOUR LOGS
const SYMBOL = 'BTCUSDT'; // Change this to match the symbol in your logs

function createSignature(queryString, apiSecret) {
  return crypto
    .createHmac('sha256', apiSecret)
    .update(queryString)
    .digest('hex');
}

async function signedRequest(endpoint, params = {}) {
  const timestamp = Date.now();
  const queryParams = {
    ...params,
    timestamp,
    recvWindow: 5000,
  };

  const queryString = new URLSearchParams(
    Object.entries(queryParams).map(([k, v]) => [k, String(v)])
  ).toString();

  const signature = createSignature(queryString, API_SECRET);
  const url = `${BASE_URL}${endpoint}?${queryString}&signature=${signature}`;

  try {
    const response = await axios.get(url, {
      headers: {
        'X-MBX-APIKEY': API_KEY,
      },
    });
    return response.data;
  } catch (error) {
    console.error(`Request failed for ${endpoint}:`, {
      status: error.response?.status,
      data: error.response?.data,
    });
    throw error;
  }
}

async function investigate() {
  console.log('\n========================================');
  console.log('LOCKED BALANCE INVESTIGATION');
  console.log('========================================\n');

  try {
    // 1. Get account information
    console.log('1. Fetching account information...\n');
    const account = await signedRequest('/api/v3/account');

    // Find BTC balance
    const btcBalance = account.balances.find(b => b.asset === 'BTC');
    if (btcBalance) {
      console.log('BTC Balance:');
      console.log('  Free:', btcBalance.free);
      console.log('  Locked:', btcBalance.locked);
      console.log('  Total:', (parseFloat(btcBalance.free) + parseFloat(btcBalance.locked)).toFixed(8));
    } else {
      console.log('No BTC balance found');
    }

    // 2. Get all open orders
    console.log('\n2. Fetching ALL open orders (all symbols)...\n');
    const allOpenOrders = await signedRequest('/api/v3/openOrders');

    if (allOpenOrders.length === 0) {
      console.log('✅ No open orders found across all symbols');
    } else {
      console.log(`⚠️  Found ${allOpenOrders.length} open order(s):\n`);
      allOpenOrders.forEach((order, index) => {
        console.log(`Order ${index + 1}:`);
        console.log('  Symbol:', order.symbol);
        console.log('  Order ID:', order.orderId);
        console.log('  Type:', order.type);
        console.log('  Side:', order.side);
        console.log('  Price:', order.price);
        console.log('  Original Quantity:', order.origQty);
        console.log('  Executed Quantity:', order.executedQty);
        console.log('  Status:', order.status);
        console.log('  Time:', new Date(order.time).toISOString());
        console.log('  Update Time:', new Date(order.updateTime).toISOString());
        if (order.stopPrice) {
          console.log('  Stop Price:', order.stopPrice);
        }
        if (order.orderListId && order.orderListId > 0) {
          console.log('  OCO Order List ID:', order.orderListId);
        }
        console.log('');
      });
    }

    // 3. Get open orders for specific symbol
    console.log(`3. Fetching open orders for ${SYMBOL}...\n`);
    const symbolOpenOrders = await signedRequest('/api/v3/openOrders', { symbol: SYMBOL });

    if (symbolOpenOrders.length === 0) {
      console.log(`✅ No open orders for ${SYMBOL}`);
    } else {
      console.log(`⚠️  Found ${symbolOpenOrders.length} open order(s) for ${SYMBOL}:\n`);

      let totalLockedByOrders = 0;
      symbolOpenOrders.forEach((order, index) => {
        const remainingQty = parseFloat(order.origQty) - parseFloat(order.executedQty);
        totalLockedByOrders += remainingQty;

        console.log(`${SYMBOL} Order ${index + 1}:`);
        console.log('  Order ID:', order.orderId);
        console.log('  Type:', order.type);
        console.log('  Side:', order.side);
        console.log('  Original Qty:', order.origQty);
        console.log('  Executed Qty:', order.executedQty);
        console.log('  Remaining Qty:', remainingQty.toFixed(8), '← LOCKED');
        console.log('  Status:', order.status);
        if (order.orderListId && order.orderListId > 0) {
          console.log('  OCO Order List ID:', order.orderListId);
        }
        console.log('');
      });

      console.log(`Total quantity locked by ${SYMBOL} orders: ${totalLockedByOrders.toFixed(8)} BTC\n`);

      if (btcBalance) {
        const lockedBalance = parseFloat(btcBalance.locked);
        const difference = lockedBalance - totalLockedByOrders;
        console.log(`Binance locked balance: ${lockedBalance.toFixed(8)} BTC`);
        console.log(`Locked by visible orders: ${totalLockedByOrders.toFixed(8)} BTC`);
        console.log(`Unexplained difference: ${difference.toFixed(8)} BTC`);

        if (Math.abs(difference) < 0.00000001) {
          console.log('✅ Locked balance fully explained by open orders');
        } else {
          console.log('⚠️  There is unexplained locked balance!');
        }
      }
    }

    // 4. Get recent order history
    console.log(`\n4. Fetching recent order history for ${SYMBOL} (last 10 orders)...\n`);
    const orderHistory = await signedRequest('/api/v3/allOrders', {
      symbol: SYMBOL,
      limit: 10,
    });

    console.log(`Recent ${SYMBOL} orders (newest first):\n`);
    orderHistory.reverse().forEach((order, index) => {
      console.log(`Order ${index + 1}:`);
      console.log('  Order ID:', order.orderId);
      console.log('  Type:', order.type);
      console.log('  Side:', order.side);
      console.log('  Original Qty:', order.origQty);
      console.log('  Executed Qty:', order.executedQty);
      console.log('  Status:', order.status);
      console.log('  Time:', new Date(order.time).toISOString());
      if (order.orderListId && order.orderListId > 0) {
        console.log('  OCO Order List ID:', order.orderListId);
      }
      console.log('');
    });

    // 5. Summary and recommendations
    console.log('\n========================================');
    console.log('SUMMARY & RECOMMENDATIONS');
    console.log('========================================\n');

    if (allOpenOrders.length > 0) {
      console.log('🔴 ISSUE FOUND: You have open orders that are locking balance');
      console.log('\nRECOMMENDATIONS:');
      console.log('1. Cancel all open orders from previous failed attempts');
      console.log('2. Add cleanup logic to cancel existing orders before creating new OCO orders');
      console.log('3. Implement proper error handling to cancel orders when OCO creation fails');
      console.log('\nSuggested fix:');
      console.log('  - Before creating OCO orders, call getOpenOrders(symbol)');
      console.log('  - Cancel any existing SELL orders for the symbol');
      console.log('  - Then create fresh OCO orders');
    } else {
      console.log('✅ No open orders found - balance should not be locked by orders');
      console.log('\nPossible causes:');
      console.log('1. Balance is still settling from a recent trade');
      console.log('2. Testnet-specific delay in balance synchronization');
      console.log('3. Transient Binance API issue');
    }

  } catch (error) {
    console.error('\n❌ Investigation failed:', error.message);
    console.log('\nMake sure you:');
    console.log('1. Replaced API_KEY and API_SECRET at the top of this file');
    console.log('2. Are using TESTNET credentials (not mainnet)');
    console.log('3. Have npm installed axios (npm install axios)');
  }
}

investigate();
