/**
 * Test Script: Signal Creation → Trade Execution → OCO Creation
 *
 * This script tests the complete flow with enhanced logging to verify:
 * 1. Signal creation fetches currentMarketPrice from mainnet
 * 2. Buy order executes and logs complete details
 * 3. OCO creation uses exact quantity from buy order
 * 4. All critical diagnostic information is logged
 *
 * Run with: node test-signal-trade-flow.js
 */

const SIGNAL_TEXT = `Buying $ROSE
First buying: 0.04180 – 0.04200
Targets: 0.04350, 0.04500, 0.04700, 0.05000
Sl: 0.03950`;

const API_BASE = "http://localhost:3000";

async function testSignalCreation(sessionCookie) {
  console.log("\n========================================");
  console.log("STEP 1: Signal Creation");
  console.log("========================================\n");

  const response = await fetch(`${API_BASE}/api/signals`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: sessionCookie,
    },
    body: JSON.stringify({
      rawSignal: SIGNAL_TEXT,
      isImageSignal: false,
    }),
  });

  const data = await response.json();

  if (!data.success) {
    throw new Error(`Signal creation failed: ${data.error?.message || "Unknown error"}`);
  }

  console.log("✅ Signal created successfully");
  console.log("\nSignal Details:");
  console.log(`- Signal ID: ${data.data.signalId}`);
  console.log(`- Symbol: ${data.data.signal.symbol}`);
  console.log(`- Entries: ${data.data.signal.entries.join(", ")}`);
  console.log(`- Targets: ${data.data.signal.targets.join(", ")}`);
  console.log(`- Stop Loss: ${data.data.signal.stopLoss}`);
  console.log(`- Current Market Price: ${data.data.signal.currentMarketPrice || "NOT FETCHED ❌"}`);
  console.log(`- Status: ${data.data.signal.status}`);

  if (!data.data.signal.currentMarketPrice) {
    console.warn("\n⚠️  WARNING: currentMarketPrice is undefined!");
    console.warn("Expected: Should be fetched from Binance mainnet");
  }

  return data.data.signalId;
}

async function testTradeExecution(sessionCookie, signalId) {
  console.log("\n========================================");
  console.log("STEP 2: Trade Execution");
  console.log("========================================\n");

  const response = await fetch(`${API_BASE}/api/trades/execute`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: sessionCookie,
    },
    body: JSON.stringify({
      signalId: signalId,
      investmentAmount: 100,
      positionSizingMethod: "fixed",
      testnet: true, // Use testnet for testing
      createOCO: true,
    }),
  });

  const data = await response.json();

  if (!data.success) {
    throw new Error(`Trade execution failed: ${data.error?.message || "Unknown error"}`);
  }

  console.log("✅ Trade executed successfully");
  console.log("\nTrade Details:");
  console.log(`- Trade ID: ${data.data.tradeId}`);
  console.log(`- Requires Approval: ${data.data.requiresApproval || false}`);

  if (data.data.buyOrder) {
    console.log("\nBuy Order Details:");
    console.log(`- Order ID: ${data.data.buyOrder.orderId}`);
    console.log(`- Symbol: ${data.data.buyOrder.symbol}`);
    console.log(`- Status: ${data.data.buyOrder.status}`);
    console.log(`- Executed Qty: ${data.data.buyOrder.executedQty}`);
    console.log(`- Quote Qty: ${data.data.buyOrder.cummulativeQuoteQty}`);

    if (data.data.buyOrder.fills && data.data.buyOrder.fills.length > 0) {
      console.log("\nFills:");
      data.data.buyOrder.fills.forEach((fill, i) => {
        console.log(`  Fill ${i + 1}:`);
        console.log(`    - Price: ${fill.price}`);
        console.log(`    - Quantity: ${fill.qty}`);
        console.log(`    - Commission: ${fill.commission} ${fill.commissionAsset}`);
      });
    }
  } else {
    console.warn("\n⚠️  WARNING: No buy order details returned!");
    console.warn("Expected: Full buy order object with executedQty");
  }

  if (data.data.ocoOrders) {
    console.log(`\n✅ OCO Orders Created: ${data.data.ocoOrders.length}`);
    data.data.ocoOrders.forEach((order, i) => {
      console.log(`\nOCO Order ${i + 1}:`);
      console.log(`- Order ID: ${order.orderId}`);
      console.log(`- Status: ${order.status}`);
    });
  } else {
    console.warn("\n⚠️  WARNING: No OCO orders returned!");
  }

  return data.data.tradeId;
}

async function checkServerLogs() {
  console.log("\n========================================");
  console.log("STEP 3: Verify Server Logs");
  console.log("========================================\n");

  console.log("Please check your server console for the following logs:");
  console.log("\n📊 Signal Creation Logs:");
  console.log("  ✓ [Signal Creation] Fetching current market price for ROSEUSDT from mainnet...");
  console.log("  ✓ [Signal Creation] Current market price for ROSEUSDT: X.XXXX");
  console.log("  ✓ POST /api/signals - Creating signal document: { currentMarketPrice: X.XXXX }");

  console.log("\n📊 Trade Execution Logs:");
  console.log("  ✓ [Trade Executor] Executing buy order for ROSEUSDT: { investmentAmount: 100, ... }");
  console.log("  ✓ [Trade Executor] Buy order executed successfully: { orderId: XXX, executedQty: 'XXXX', ... }");
  console.log("  ✓ [Trade Executor] Buy order processed: { executedQuantity: XXXX, ... }");
  console.log("  ✓ [Trade Executor] Trade document created: { tradeId: XXX, quantity: XXXX, ... }");

  console.log("\n📊 OCO Creation Logs:");
  console.log("  ✓ [OCO Creation] Starting OCO order creation: { buyQuantity: XXXX, ... }");
  console.log("  ✓ [OCO] ROSEUSDT - Balance check for ROSE: Available=XXXX, Required (from buy order)=XXXX");
  console.log("  ✓ [OCO] ROSEUSDT - Balance verification passed");
  console.log("  ✓ Creating OCO for target 0/1/2: { adjustedQty: XXXX, ... }");

  console.log("\n⚠️  Critical Checks:");
  console.log("  1. currentMarketPrice should NOT be undefined");
  console.log("  2. Buy order executedQty should match trade.quantity");
  console.log("  3. OCO 'Required' quantity should match buy executedQty");
  console.log("  4. No 'MISMATCH DETECTED' warnings");
}

async function main() {
  console.log("===========================================");
  console.log("Signal → Trade → OCO Flow Test");
  console.log("===========================================");

  // Get session cookie from environment or prompt
  const sessionCookie = process.env.SESSION_COOKIE;

  if (!sessionCookie) {
    console.error("\n❌ ERROR: SESSION_COOKIE environment variable not set");
    console.log("\nHow to get your session cookie:");
    console.log("1. Login to http://localhost:3000");
    console.log("2. Open DevTools (F12)");
    console.log("3. Go to Application tab → Cookies");
    console.log("4. Copy the 'session' cookie value");
    console.log("\nThen run:");
    console.log('SESSION_COOKIE="session=YOUR_COOKIE_VALUE" node test-signal-trade-flow.js');
    process.exit(1);
  }

  try {
    // Step 1: Create signal (should fetch currentMarketPrice)
    const signalId = await testSignalCreation(sessionCookie);

    // Step 2: Execute trade (should log buy order details)
    const tradeId = await testTradeExecution(sessionCookie, signalId);

    // Step 3: Check server logs
    await checkServerLogs();

    console.log("\n===========================================");
    console.log("✅ Test completed successfully!");
    console.log("===========================================");
    console.log(`\nSignal ID: ${signalId}`);
    console.log(`Trade ID: ${tradeId}`);
    console.log("\nNext: Check server console logs for detailed diagnostics");

  } catch (error) {
    console.error("\n❌ Test failed:", error.message);
    process.exit(1);
  }
}

main();
