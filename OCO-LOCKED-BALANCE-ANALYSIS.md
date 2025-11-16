# OCO Locked Balance Investigation - Root Cause Analysis

**Date**: Nov 15, 2025
**Issue**: Binance rejecting OCO orders with error -2010 (Insufficient balance) despite logs showing sufficient balance
**Status**: INVESTIGATION IN PROGRESS

---

## Critical Evidence from Logs

```
Available balance: 1.00227000 BTC
Locked balance: 0.00196000 BTC  ← SUSPICIOUS
Buy order executed: 0.00103000 BTC

OCO 1 requires: 0.00077250 BTC
OCO 1 sent to Binance: 0.00077 BTC (rounded)

Binance response: -2010 Insufficient balance
```

---

## Key Observation: DOUBLE LOCKING

**Expected locked balance**: ~0.00103 BTC (from buy order)
**Actual locked balance**: 0.00196 BTC (almost DOUBLE)
**Difference**: 0.00093 BTC (~90% of buy quantity) is locked somewhere else

---

## Root Cause Hypothesis

### Most Likely: Phantom Open Orders from Previous Failed Attempts

**Theory**: When OCO creation fails (timeout, -2010 error, etc.), the code assumes the order was not created. However, Binance may have partially created the order before the error occurred, leaving it in OPEN status.

**Why this happens**:
1. Code sends OCO order to Binance
2. Binance receives request, creates order, locks balance
3. Network timeout or API error occurs BEFORE response is sent back
4. Our code thinks order failed and retries
5. Original order is still OPEN on Binance, locking balance
6. New retry attempt sees insufficient balance (because first order locked it)
7. Infinite loop: each retry creates more phantom orders

**Evidence supporting this theory**:
- Locked balance (0.00196 BTC) is almost exactly 2x buy quantity (0.00103 BTC)
- Suggests TWO OCO orders are locking balance, not one
- First OCO attempt may have succeeded on Binance but failed to respond
- Second OCO attempt hit -2010 because first one already locked the balance

---

## Current Code Behavior Analysis

### Settlement Delay (CORRECT)
```typescript
// app/api/trades/execute/route.ts:68-76
const settlementDelay = testnet
  ? TRADE_EXECUTION.TESTNET_SETTLEMENT_DELAY_MS  // 3 seconds
  : TRADE_EXECUTION.MAINNET_SETTLEMENT_DELAY_MS; // 2 seconds

await new Promise(resolve => setTimeout(resolve, settlementDelay));
```
✅ This is working correctly - code waits for settlement before OCO creation.

### Balance Check (PARTIALLY CORRECT)
```typescript
// lib/binance/trade-executor.ts:454-467
const initialAccountInfo = await client.getAccount();
const initialAvailableBalance = parseFloat(initialAssetBalance?.free || '0');
const initialLockedBalance = parseFloat(initialAssetBalance?.locked || '0');

console.log(
  `[OCO] ${trade.symbol} - Initial balance:`,
  `Available=${initialAvailableBalance.toFixed(8)},`,
  `Locked=${initialLockedBalance.toFixed(8)},`,  // ← Logs locked but doesn't investigate WHY
  `Required (from buy order)=${trade.quantity.toFixed(8)},`
);
```
⚠️ Code logs locked balance but **doesn't check if locked > expected**.

### Missing: Open Orders Check
```typescript
// lib/binance/client.ts:393-400
async getOpenOrders(symbol?: string): Promise<BinanceOrderResponse[]> {
  const params = symbol ? { symbol } : {};
  return this.signedRequest<BinanceOrderResponse[]>(
    "GET",
    "/api/v3/openOrders",
    params
  );
}
```
❌ **Method exists but is NEVER called before OCO creation**.

---

## What Should Happen vs What's Happening

### Expected Flow
```
1. Buy order executes: 0.00103 BTC purchased
2. Settlement delay: 2-3 seconds
3. Balance updates: free += 0.00103 BTC, locked = 0
4. OCO creation: locks 0.00103 BTC in SELL orders
5. Final state: locked = 0.00103 BTC
```

### Actual Flow (Suspected)
```
1. Buy order executes: 0.00103 BTC purchased
2. Settlement delay: 2-3 seconds
3. Balance updates: free += 0.00103 BTC, locked = 0
4. First OCO attempt: Binance creates order, locks 0.00103 BTC
5. Network timeout/error: Code thinks OCO failed
6. Retry logic: Tries creating OCO again
7. Second OCO attempt: Binance sees only 0.00124 BTC free (0.00227 - 0.00103 locked)
8. Binance requires 0.00077 BTC for OCO, but assumes 0.00103 already locked
9. Error -2010: Insufficient balance
10. Final state: locked = 0.00196 BTC (TWO phantom OCO orders)
```

---

## Diagnostic Steps Required

Run the investigation script to confirm hypothesis:

```bash
node investigate-locked-balance.js
```

**What to look for**:
1. **Open Orders Count**: If > 0, confirms phantom orders exist
2. **OCO Order List IDs**: Multiple OCO orders for same trade
3. **Locked Balance Match**: Does locked balance = sum of open order quantities?
4. **Order Timestamps**: Recent failed orders that are still OPEN

**Expected findings if hypothesis is correct**:
- 2-3 OPEN SELL orders for BTCUSDT
- Each order has orderListId (OCO pair)
- Total quantity of OPEN orders ≈ 0.00196 BTC
- Orders created within last few minutes (from failed attempts)

---

## Proposed Fix (Multi-Layer)

### Layer 1: Cleanup Existing Orders Before OCO Creation

```typescript
// lib/binance/trade-executor.ts:402 (before OCO loop)
export async function createOCOOrders(
  tradeId: Types.ObjectId,
  testnet = false
): Promise<{ success: boolean; orders?: OCOOrderResult[]; error?: string }> {
  try {
    await connectDB();
    const trade = await Trade.findById(tradeId);
    // ... existing setup code ...

    // **NEW: Cancel existing open orders for this symbol before creating new OCO orders**
    console.log(`[OCO] ${trade.symbol} - Checking for existing open orders...`);
    const existingOrders = await client.getOpenOrders(trade.symbol);

    if (existingOrders.length > 0) {
      console.warn(
        `[OCO] ${trade.symbol} - Found ${existingOrders.length} existing open order(s). ` +
        `Cancelling them to prevent balance locking issues...`
      );

      for (const order of existingOrders) {
        // Only cancel SELL orders (our OCO orders), not BUY orders
        if (order.side === 'SELL') {
          try {
            if (order.orderListId && order.orderListId > 0) {
              // Cancel entire OCO list
              await client.cancelOCOOrder(trade.symbol, order.orderListId);
              console.log(`[OCO] ${trade.symbol} - Cancelled OCO order list ${order.orderListId}`);
            } else {
              // Cancel individual order
              await client.cancelOrder(trade.symbol, order.orderId);
              console.log(`[OCO] ${trade.symbol} - Cancelled order ${order.orderId}`);
            }
          } catch (cancelError) {
            console.error(`[OCO] ${trade.symbol} - Failed to cancel order ${order.orderId}:`, cancelError);
            // Continue anyway - Binance may have already cancelled it
          }
        }
      }

      // Wait for cancellations to settle
      console.log(`[OCO] ${trade.symbol} - Waiting 1s for order cancellations to settle...`);
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Verify balance freed up
      const updatedAccount = await client.getAccount();
      const updatedBalance = parseFloat(
        updatedAccount.balances.find(b => b.asset === baseAsset)?.free || '0'
      );
      console.log(
        `[OCO] ${trade.symbol} - Balance after cleanup: ${updatedBalance.toFixed(8)} ` +
        `(was ${initialAvailableBalance.toFixed(8)})`
      );
    } else {
      console.log(`[OCO] ${trade.symbol} - No existing open orders found`);
    }

    // ... existing OCO creation code ...
  }
}
```

### Layer 2: Detect Locked Balance Anomaly

```typescript
// lib/binance/trade-executor.ts:453 (after initial balance check)
const expectedLockedBalance = 0; // Should be 0 after buy order settles
const actualLockedBalance = parseFloat(initialAssetBalance?.locked || '0');

if (actualLockedBalance > TRADE_EXECUTION.BALANCE_TOLERANCE) {
  console.warn(
    `[OCO] ${trade.symbol} - ANOMALY DETECTED: Locked balance is ${actualLockedBalance.toFixed(8)}, ` +
    `expected ~0 after settlement. This suggests phantom open orders exist.`
  );

  // Fetch open orders to diagnose
  const openOrders = await client.getOpenOrders(trade.symbol);
  if (openOrders.length > 0) {
    console.error(
      `[OCO] ${trade.symbol} - Found ${openOrders.length} phantom open order(s):`,
      openOrders.map(o => ({
        orderId: o.orderId,
        type: o.type,
        side: o.side,
        origQty: o.origQty,
        status: o.status,
        orderListId: o.orderListId,
      }))
    );
    throw new ValidationError(
      `Cannot create OCO orders - ${openOrders.length} phantom order(s) are locking balance. ` +
      `Please cancel existing orders manually and retry.`
    );
  }
}
```

### Layer 3: Idempotency Check

```typescript
// lib/db/models/Trade.ts (add new field)
{
  ocoAttempts: {
    type: Number,
    default: 0,
    required: true,
  },
  ocoOrderListIds: [{
    type: Number,
    default: [],
  }],
}

// lib/binance/trade-executor.ts:402
// Before creating OCO, check if we already tried
if (trade.ocoAttempts > 0) {
  console.warn(
    `[OCO] ${trade.symbol} - This is OCO attempt #${trade.ocoAttempts + 1} for trade ${trade._id}. ` +
    `Previous attempts may have created phantom orders.`
  );

  // Check if previous attempts created orders
  if (trade.ocoOrderListIds.length > 0) {
    console.log(`[OCO] ${trade.symbol} - Found ${trade.ocoOrderListIds.length} OCO list(s) from previous attempts`);
    // Cancel them all
    for (const orderListId of trade.ocoOrderListIds) {
      try {
        await client.cancelOCOOrder(trade.symbol, orderListId);
        console.log(`[OCO] ${trade.symbol} - Cancelled previous OCO list ${orderListId}`);
      } catch (error) {
        console.warn(`[OCO] ${trade.symbol} - Could not cancel OCO list ${orderListId} (may be already filled/cancelled)`);
      }
    }
  }
}

// Increment attempt counter
trade.ocoAttempts = (trade.ocoAttempts || 0) + 1;
await trade.save();

// After successful OCO creation, store orderListId
trade.ocoOrderListIds.push(ocoResponse.orderListId);
await trade.save();
```

---

## Testing Plan

1. **Run Diagnostic Script** (`investigate-locked-balance.js`)
   - Confirm phantom orders exist
   - Document order IDs and quantities

2. **Manual Cleanup** (if phantom orders found)
   ```bash
   # Cancel all open orders for BTCUSDT
   # Use Binance Testnet UI or API
   ```

3. **Implement Layer 1 Fix** (cancel existing orders before OCO)
   - Test with fresh trade
   - Verify no -2010 errors

4. **Implement Layer 2 Fix** (detect anomaly)
   - Test with intentionally created phantom order
   - Verify error is thrown with clear message

5. **Implement Layer 3 Fix** (idempotency)
   - Test retry scenarios
   - Verify previous orders are cancelled

6. **End-to-End Test**
   - Create signal
   - Execute trade
   - Verify OCO creation succeeds
   - Check final balance (free + locked should equal original balance)

---

## Expected Outcome

After implementing fixes:
- ✅ No phantom orders left behind after failed OCO attempts
- ✅ Locked balance always equals sum of OPEN order quantities
- ✅ -2010 errors only occur for legitimate insufficient balance scenarios
- ✅ Clear error messages when anomalies detected
- ✅ Automatic cleanup of stale orders before retry

---

## References

**Code Files**:
- `lib/binance/client.ts` - BinanceClient.getOpenOrders(), cancelOrder(), cancelOCOOrder()
- `lib/binance/trade-executor.ts` - createOCOOrders()
- `app/api/trades/execute/route.ts` - POST handler calling createOCOOrders()

**Binance API Docs**:
- `/api/v3/openOrders` - Get all open orders
- `/api/v3/order` (DELETE) - Cancel individual order
- `/api/v3/orderList` (DELETE) - Cancel OCO order list

**Previous Sessions**:
- Nov 12: OCO settlement delay fix (added proactive delay)
- Nov 15: Settlement verification fix (changed from increase check to sufficient check)
- Nov 15: OCO response structure fix (handle orderReports array)

---

## Next Steps

1. **User Action**: Run `node investigate-locked-balance.js` with your testnet credentials
2. **Report Findings**: Share results (number of open orders, locked balance breakdown)
3. **Apply Fix**: Based on findings, implement appropriate layer(s)
4. **Retest**: Execute new trade to verify -2010 error is resolved

---

**Status**: READY FOR USER INVESTIGATION
**Priority**: CRITICAL (blocking all OCO order creation)
