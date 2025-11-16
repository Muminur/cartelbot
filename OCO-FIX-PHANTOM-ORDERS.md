# OCO Phantom Orders Fix - Implementation Guide

**Issue**: Binance -2010 error due to phantom open orders locking balance
**Root Cause**: Failed OCO attempts leave orders in OPEN status on Binance
**Solution**: Cancel existing orders before creating new OCO orders

---

## Implementation

### File 1: Update Trade Model (Add Tracking Fields)

**File**: `lib/db/models/Trade.ts`

**Add to schema** (after existing fields):
```typescript
{
  // ... existing fields ...

  // Track OCO creation attempts to prevent duplicate orders
  ocoAttempts: {
    type: Number,
    default: 0,
  },

  // Store OCO order list IDs from all attempts (for cleanup)
  ocoOrderListIds: [{
    type: Number,
  }],

  // Timestamp of last OCO attempt
  lastOcoAttempt: {
    type: Date,
  },
}
```

---

### File 2: Update Trade Executor (Add Cleanup Logic)

**File**: `lib/binance/trade-executor.ts`

**Location**: Inside `createOCOOrders()` function, after line 452 (before balance check)

**Add this code block**:

```typescript
// ====================================================================================
// CRITICAL FIX: Cancel existing open orders before creating new OCO orders
// This prevents phantom orders from previous failed attempts locking balance
// ====================================================================================

console.log(`[OCO] ${trade.symbol} - Checking for phantom open orders...`);

// Check if this is a retry attempt
const isRetry = (trade.ocoAttempts || 0) > 0;
if (isRetry) {
  console.warn(
    `[OCO] ${trade.symbol} - This is OCO attempt #${(trade.ocoAttempts || 0) + 1} for trade ${trade._id}. ` +
    `Previous attempts may have created phantom orders that need cleanup.`
  );
}

// Fetch all open orders for this symbol
const existingOpenOrders = await client.getOpenOrders(trade.symbol);

if (existingOpenOrders.length > 0) {
  console.warn(
    `[OCO] ${trade.symbol} - Found ${existingOpenOrders.length} existing open order(s):`,
    existingOpenOrders.map(o => ({
      orderId: o.orderId,
      type: o.type,
      side: o.side,
      origQty: o.origQty,
      executedQty: o.executedQty,
      status: o.status,
      orderListId: o.orderListId || null,
    }))
  );

  // Calculate total quantity locked by existing orders
  const totalLockedByOrders = existingOpenOrders
    .filter(o => o.side === 'SELL') // Only count SELL orders (our OCO orders)
    .reduce((sum, o) => sum + (parseFloat(o.origQty) - parseFloat(o.executedQty)), 0);

  console.warn(
    `[OCO] ${trade.symbol} - Total quantity locked by existing SELL orders: ${totalLockedByOrders.toFixed(8)} ${baseAsset}`
  );

  // Cancel all SELL orders (our OCO orders from previous attempts)
  let cancelledCount = 0;
  const cancelledOrderListIds = new Set<number>();

  for (const order of existingOpenOrders) {
    // Only cancel SELL orders (skip BUY orders - those might be legitimate)
    if (order.side !== 'SELL') {
      console.log(`[OCO] ${trade.symbol} - Skipping ${order.side} order ${order.orderId} (not a sell order)`);
      continue;
    }

    try {
      if (order.orderListId && order.orderListId > 0 && !cancelledOrderListIds.has(order.orderListId)) {
        // Cancel entire OCO list (cancels both LIMIT_MAKER and STOP_LOSS_LIMIT)
        await client.cancelOCOOrder(trade.symbol, order.orderListId);
        cancelledOrderListIds.add(order.orderListId);
        cancelledCount += 2; // OCO has 2 orders
        console.log(
          `[OCO] ${trade.symbol} - Cancelled OCO order list ${order.orderListId} ` +
          `(includes both take profit and stop loss orders)`
        );
      } else if (!order.orderListId || order.orderListId <= 0) {
        // Cancel individual order (not part of OCO)
        await client.cancelOrder(trade.symbol, order.orderId);
        cancelledCount++;
        console.log(`[OCO] ${trade.symbol} - Cancelled individual order ${order.orderId}`);
      }
    } catch (cancelError: unknown) {
      // Order may already be filled/cancelled - log warning but continue
      const errorMsg = cancelError instanceof Error ? cancelError.message : String(cancelError);
      console.warn(
        `[OCO] ${trade.symbol} - Failed to cancel order ${order.orderId}: ${errorMsg}. ` +
        `Order may already be filled/cancelled. Continuing...`
      );
    }
  }

  if (cancelledCount > 0) {
    console.log(
      `[OCO] ${trade.symbol} - Successfully cancelled ${cancelledCount} order(s). ` +
      `Waiting 2s for cancellations to settle and balance to be freed...`
    );
    await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for Binance to process cancellations

    // Verify balance was freed up
    const accountAfterCleanup = await client.getAccount();
    const balanceAfterCleanup = parseFloat(
      accountAfterCleanup.balances.find(b => b.asset === baseAsset)?.free || '0'
    );
    const lockedAfterCleanup = parseFloat(
      accountAfterCleanup.balances.find(b => b.asset === baseAsset)?.locked || '0'
    );

    console.log(
      `[OCO] ${trade.symbol} - Balance after cleanup:`,
      `Free=${balanceAfterCleanup.toFixed(8)},`,
      `Locked=${lockedAfterCleanup.toFixed(8)},`,
      `Freed=${(balanceAfterCleanup - initialAvailableBalance).toFixed(8)}`
    );

    // Update initialAvailableBalance with new value after cleanup
    initialAvailableBalance = balanceAfterCleanup;
  }
} else {
  console.log(`[OCO] ${trade.symbol} - ✅ No existing open orders found. Proceeding with clean state.`);
}

// Track this OCO attempt
trade.ocoAttempts = (trade.ocoAttempts || 0) + 1;
trade.lastOcoAttempt = new Date();
await trade.save();

// ====================================================================================
// END OF PHANTOM ORDER CLEANUP
// ====================================================================================
```

**Location for insertion**: After line 452 in `trade-executor.ts`, right before this comment:
```typescript
// Initial balance check (will be updated if additional settlement delay needed)
```

---

### File 3: Track Successful OCO Creation

**File**: `lib/binance/trade-executor.ts`

**Location**: Inside the OCO creation loop, after successful OCO response (around line 759)

**Add this code**:

```typescript
// After successful OCO creation, track the order list ID for future cleanup
if (ocoResponse.orderListId) {
  if (!trade.ocoOrderListIds) {
    trade.ocoOrderListIds = [];
  }
  if (!trade.ocoOrderListIds.includes(ocoResponse.orderListId)) {
    trade.ocoOrderListIds.push(ocoResponse.orderListId);
  }
}
```

**Exact location**: After line 759 (after `totalAllocatedQty += adjustedQty;`), add:

```typescript
totalAllocatedQty += adjustedQty;

// Track OCO order list ID for future cleanup/retry scenarios
if (ocoResponse.orderListId && !trade.ocoOrderListIds?.includes(ocoResponse.orderListId)) {
  trade.ocoOrderListIds = trade.ocoOrderListIds || [];
  trade.ocoOrderListIds.push(ocoResponse.orderListId);
}

// Log successful OCO creation
console.log(
  `[OCO] ${trade.symbol} - OCO ${i} created successfully. ` +
  // ... rest of existing log ...
```

---

### File 4: Add Locked Balance Anomaly Detection

**File**: `lib/binance/trade-executor.ts`

**Location**: After the initial balance check (after line 467), before settlement verification

**Add this code**:

```typescript
// Detect anomaly: Locked balance should be ~0 after buy order settlement
// If locked > tolerance, suggests phantom orders exist
const expectedLockedBalance = 0; // Should be 0 after buy order settles and before OCO creation
const lockedBalanceAnomaly = initialLockedBalance > TRADE_EXECUTION.BALANCE_TOLERANCE;

if (lockedBalanceAnomaly) {
  console.error(
    `[OCO] ${trade.symbol} - ⚠️  ANOMALY DETECTED: Locked balance is ${initialLockedBalance.toFixed(8)} ${baseAsset}, ` +
    `expected ~0 after buy order settlement. This suggests phantom open orders exist from previous failed attempts.`
  );

  // This will be cleaned up by the phantom order cleanup logic above
  // No need to throw error here - cleanup will handle it
}
```

---

## Testing Instructions

### Step 1: Verify Current State

Run diagnostic script to see if phantom orders exist:
```bash
# Edit investigate-locked-balance.js with your API credentials
node investigate-locked-balance.js
```

### Step 2: Manual Cleanup (if needed)

If phantom orders found, cancel them manually first:
```bash
# Use Binance Testnet UI or write cleanup script
# This ensures clean slate before applying fix
```

### Step 3: Apply Code Changes

1. Update `lib/db/models/Trade.ts` - Add tracking fields
2. Update `lib/binance/trade-executor.ts` - Add cleanup logic
3. Rebuild TypeScript: `npx tsc --noEmit`
4. Restart dev server: `npm run dev`

### Step 4: Test Trade Execution

1. Create new signal
2. Execute trade
3. Monitor logs for phantom order detection
4. Verify OCO orders created successfully
5. Check final balance (free + locked = expected)

### Step 5: Test Retry Scenario

Simulate failed OCO attempt:
1. Execute trade
2. Kill process during OCO creation (Ctrl+C)
3. Restart server
4. Execute same trade again
5. Verify cleanup detects and cancels phantom orders
6. Verify new OCO orders created successfully

---

## Expected Log Output (After Fix)

### Scenario 1: Clean State (No Phantom Orders)
```
[OCO] BTCUSDT - Checking for phantom open orders...
[OCO] BTCUSDT - ✅ No existing open orders found. Proceeding with clean state.
[OCO] BTCUSDT - Initial balance: Available=1.00227000, Locked=0.00000000, Required=0.00103000
[OCO] BTCUSDT - Balance already sufficient for OCO orders. Proceeding immediately.
[OCO] BTCUSDT - OCO 0 created successfully. Locked 0.00077250 BTC (75% of position).
[OCO] BTCUSDT - OCO 1 created successfully. Locked 0.00015450 BTC (15% of position).
[OCO] BTCUSDT - OCO 2 created successfully. Locked 0.00010300 BTC (10% of position).
```

### Scenario 2: Phantom Orders Detected and Cleaned
```
[OCO] BTCUSDT - Checking for phantom open orders...
[OCO] BTCUSDT - This is OCO attempt #2 for trade 67890...
[OCO] BTCUSDT - Found 2 existing open order(s):
  [{ orderId: 12345, type: 'LIMIT_MAKER', side: 'SELL', origQty: '0.00077', status: 'NEW', orderListId: 100 },
   { orderId: 12346, type: 'STOP_LOSS_LIMIT', side: 'SELL', origQty: '0.00077', status: 'NEW', orderListId: 100 }]
[OCO] BTCUSDT - Total quantity locked by existing SELL orders: 0.00154000 BTC
[OCO] BTCUSDT - Cancelled OCO order list 100 (includes both take profit and stop loss orders)
[OCO] BTCUSDT - Successfully cancelled 2 order(s). Waiting 2s for cancellations to settle...
[OCO] BTCUSDT - Balance after cleanup: Free=1.00227000, Locked=0.00000000, Freed=0.00154000
[OCO] BTCUSDT - ✅ No existing open orders found. Proceeding with clean state.
[OCO] BTCUSDT - OCO 0 created successfully. Locked 0.00077250 BTC (75% of position).
```

---

## Success Criteria

After implementing fix:
- ✅ No -2010 errors due to phantom orders
- ✅ Locked balance always matches active OPEN orders
- ✅ Retry attempts automatically clean up previous failed orders
- ✅ Clear logs showing cleanup actions taken
- ✅ Trade execution succeeds on first attempt (clean state)
- ✅ Trade execution succeeds on retry (after cleanup)

---

## Rollback Plan

If fix causes issues:
1. Revert changes to `lib/binance/trade-executor.ts`
2. Remove new fields from `lib/db/models/Trade.ts`
3. Restart server
4. Manually cancel phantom orders via Binance UI

---

**Status**: READY FOR IMPLEMENTATION
**Estimated Time**: 15-20 minutes
**Risk**: LOW (adds cleanup logic, doesn't change core OCO creation)
