# Phantom Order Cleanup - Safe Implementation Proposal

**Date**: November 15, 2025
**Status**: URGENT - Dangerous code removed, safe implementation required
**Priority**: HIGH - Affects user stop loss protection

---

## Critical Bug Identified

### The Problem

**Location**: `lib/binance/trade-executor.ts` lines 568-625 (REMOVED)

**Dangerous Code** (now removed):
```typescript
// DANGEROUS: Cancels ALL sell orders for the symbol
const openOrders = await client.getOpenOrders(symbol);
const openSellOrders = openOrders.filter(order => order.side === 'SELL');

for (const order of openSellOrders) {
  await client.cancelOrder(symbol, order.orderId);
}
```

**Impact**:
- Cancels ALL sell orders for a symbol, not just orders from current trade
- **Destroys stop loss protection from other active trades**
- Can cause significant financial loss if market moves against user

**Example Scenario**:
1. User has Trade A with 3 OCO orders (orderIds: 1851810, 1851812, 1851814) - LEGITIMATE
2. User submits new signal for same symbol → Trade B starts executing
3. Trade B's OCO creation encounters balance lock
4. Cleanup logic cancels ALL sell orders → **Trade A's stop losses are removed**
5. If market crashes, Trade A has no protection → MAJOR LOSS

---

## Root Cause: Phantom Orders

### What Are Phantom Orders?

When `createOCOOrder()` is called, Binance may:
1. Accept the request and create orders on their side
2. Return a response that fails to parse (network error, timeout, etc.)
3. Our code thinks the OCO failed, but Binance actually created orders
4. These "phantom orders" lock balance, causing -2010 errors on retry

### Why They Cause Problems

- Phantom orders lock the user's balance
- Locked balance causes subsequent OCO creations to fail with `-2010` (insufficient balance)
- Previous "solution" tried to cancel ALL orders → dangerous!

---

## Safe Solution Design

### Phase 1: Track Failed OCO Attempts (REQUIRED)

**Goal**: Store orderListId even when response parsing fails

#### 1. Update Trade Model

Add new field to track failed OCO attempts:

```typescript
// types/index.ts
export interface ITrade extends Document {
  // ... existing fields ...
  failedOCOAttempts?: Array<{
    orderListId: number;
    targetIndex: number;
    timestamp: Date;
    error: string;
  }>;
}
```

```typescript
// lib/db/models/Trade.ts
failedOCOAttempts: {
  type: [{
    orderListId: {
      type: Number,
      required: true,
    },
    targetIndex: {
      type: Number,
      required: true,
    },
    timestamp: {
      type: Date,
      required: true,
      default: Date.now,
    },
    error: {
      type: String,
      required: true,
    },
  }],
  default: [],
}
```

#### 2. Modify createOCOOrder() in BinanceClient

Capture orderListId BEFORE parsing the full response:

```typescript
// lib/binance/client.ts
async createOCOOrder(
  symbol: string,
  quantity: number,
  price: number,
  stopPrice: number,
  stopLimitPrice: number
): Promise<BinanceOCOResponse> {
  const url = `${this.baseURL}/api/v3/order/oco`;
  const params = {
    symbol,
    side: "SELL",
    quantity: this.formatQuantity(quantity),
    price: this.formatPrice(price),
    stopPrice: this.formatPrice(stopPrice),
    stopLimitPrice: this.formatPrice(stopLimitPrice),
    stopLimitTimeInForce: "GTC",
    recvWindow: 5000,
    timestamp: Date.now(),
  };

  const response = await this.signedRequest("POST", url, params);
  const data = await response.json();

  // CRITICAL: Capture orderListId FIRST, even if rest of parsing fails
  const orderListId = data.orderListId;

  if (!orderListId) {
    throw new BinanceAPIError(
      "OCO response missing orderListId",
      data.code || -1,
      data.msg || "Invalid response structure"
    );
  }

  // Now parse the rest (may throw, but we have orderListId)
  if (!data.orderReports || !Array.isArray(data.orderReports)) {
    // Store this failed attempt for cleanup
    throw new BinanceAPIError(
      "OCO response missing orderReports",
      data.code || -1,
      data.msg || "Invalid response structure",
      { orderListId } // Pass orderListId in error metadata
    );
  }

  return data as BinanceOCOResponse;
}
```

#### 3. Update Trade Executor to Store Failed Attempts

Catch OCO creation errors and store orderListId:

```typescript
// lib/binance/trade-executor.ts (in createOCOOrders function)
try {
  const ocoResponse = await retryOCOCreation(
    () => client.createOCOOrder(
      trade.symbol,
      adjustedQty,
      adjustedPrice,
      adjustedStopPrice,
      adjustedStopLimitPrice
    ),
    trade.symbol,
    balanceCheckFn
  );

  // Process successful response...
} catch (error) {
  console.error(`Failed to create OCO for target ${i}:`, error);

  // CRITICAL: If error contains orderListId, this is a phantom order
  if (error instanceof BinanceAPIError && error.metadata?.orderListId) {
    trade.failedOCOAttempts = trade.failedOCOAttempts || [];
    trade.failedOCOAttempts.push({
      orderListId: error.metadata.orderListId,
      targetIndex: i,
      timestamp: new Date(),
      error: error.message,
    });
    await trade.save();

    console.warn(
      `[OCO] ${trade.symbol} - Phantom order detected with orderListId ${error.metadata.orderListId}. ` +
      `Stored for cleanup.`
    );
  }

  // Continue to next target
  continue;
}
```

### Phase 2: Safe Cleanup (REQUIRED)

**Goal**: Only cancel orders that belong to current trade

#### Cleanup Implementation

Add this BEFORE creating new OCO orders:

```typescript
// lib/binance/trade-executor.ts (at start of createOCOOrders function)

// Step 1: Check if we have failed OCO attempts to clean up
if (trade.failedOCOAttempts && trade.failedOCOAttempts.length > 0) {
  console.log(
    `[OCO] ${trade.symbol} - Found ${trade.failedOCOAttempts.length} failed OCO attempt(s) to clean up`
  );

  for (const failedAttempt of trade.failedOCOAttempts) {
    try {
      // Get all open orders for this symbol
      const openOrders = await client.getOpenOrders(trade.symbol);

      // CRITICAL: Only cancel orders that match OUR failed orderListId
      const phantomOrders = openOrders.filter(
        order => order.orderListId === failedAttempt.orderListId
      );

      if (phantomOrders.length > 0) {
        console.log(
          `[OCO] ${trade.symbol} - Found ${phantomOrders.length} phantom order(s) ` +
          `from failed attempt (orderListId: ${failedAttempt.orderListId}). Cancelling...`
        );

        for (const order of phantomOrders) {
          try {
            await client.cancelOrder(trade.symbol, order.orderId);
            console.log(
              `[OCO] ${trade.symbol} - Cancelled phantom order ${order.orderId} ` +
              `(${order.type}, qty: ${order.origQty})`
            );
          } catch (cancelError) {
            console.error(
              `[OCO] ${trade.symbol} - Failed to cancel phantom order ${order.orderId}:`,
              cancelError instanceof Error ? cancelError.message : 'Unknown error'
            );
          }
        }

        // Wait for cancellations to settle
        await new Promise(resolve => setTimeout(resolve, 2000));
      } else {
        console.log(
          `[OCO] ${trade.symbol} - No phantom orders found for orderListId ${failedAttempt.orderListId} ` +
          `(may have already been cancelled or filled)`
        );
      }
    } catch (error) {
      console.error(
        `[OCO] ${trade.symbol} - Failed to clean up phantom orders for orderListId ${failedAttempt.orderListId}:`,
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  }

  // Clear failed attempts after cleanup
  trade.failedOCOAttempts = [];
  await trade.save();
  console.log(`[OCO] ${trade.symbol} - Phantom order cleanup complete`);
}
```

---

## Alternative: Prevent Phantom Orders (OPTIONAL)

If we can prevent phantom orders from occurring, cleanup becomes unnecessary.

### Strategy: Idempotent OCO Creation

Use Binance's `newClientOrderId` parameter to make OCO creation idempotent:

```typescript
// Generate deterministic client order ID
const clientOrderId = `${trade._id}-target-${i}-${Date.now()}`;

const params = {
  symbol,
  side: "SELL",
  quantity: this.formatQuantity(quantity),
  price: this.formatPrice(price),
  stopPrice: this.formatPrice(stopPrice),
  stopLimitPrice: this.formatPrice(stopLimitPrice),
  stopLimitTimeInForce: "GTC",
  newClientOrderId: clientOrderId, // Idempotency key
  recvWindow: 5000,
  timestamp: Date.now(),
};
```

**Benefits**:
- If we retry with same `newClientOrderId`, Binance returns existing order instead of creating duplicate
- Prevents phantom orders entirely
- Simpler than cleanup logic

**Drawbacks**:
- Still need error handling for response parsing failures
- `newClientOrderId` must be unique per order (include timestamp)
- Doesn't solve issue of response parsing failures (we still don't know if order was created)

---

## Recommended Implementation Plan

### Step 1: Immediate (DONE)
- [x] Remove dangerous cleanup logic (COMPLETED)
- [x] Add TODO comment with explanation
- [x] Document safe solution in this proposal

### Step 2: Short-term (Required for production)
1. Update TypeScript types (`types/index.ts`) - add `failedOCOAttempts` field
2. Update Trade model (`lib/db/models/Trade.ts`) - add schema field
3. Update BinanceAPIError (`lib/utils/errors.ts`) - support metadata property
4. Modify `createOCOOrder()` in `lib/binance/client.ts` - capture orderListId first
5. Update `createOCOOrders()` in `lib/binance/trade-executor.ts`:
   - Catch errors with orderListId
   - Store failed attempts in Trade document
   - Add cleanup logic at start of function
6. Test thoroughly on testnet:
   - Simulate network failures during OCO creation
   - Verify phantom orders are detected and cleaned up
   - Verify legitimate orders from other trades are NEVER touched

### Step 3: Long-term (Optional enhancement)
1. Implement idempotent OCO creation with `newClientOrderId`
2. Add admin UI to view/manage phantom orders
3. Add monitoring alert when phantom orders are detected
4. Implement automatic retry with exponential backoff for response parsing failures

---

## Testing Checklist

### Critical Test Cases

1. **Multiple trades for same symbol**:
   - [ ] Create Trade A with OCO orders
   - [ ] Start Trade B while Trade A is still open
   - [ ] Verify Trade A's OCO orders are NOT cancelled
   - [ ] Verify only Trade B's failed attempts are cleaned up

2. **Phantom order detection**:
   - [ ] Simulate OCO response parsing failure
   - [ ] Verify orderListId is captured and stored
   - [ ] Verify phantom orders are cancelled on retry
   - [ ] Verify balance is freed after cleanup

3. **No phantom orders case**:
   - [ ] Create trade with successful OCO orders
   - [ ] Verify no cleanup is performed
   - [ ] Verify no warnings logged about phantom orders

4. **Edge cases**:
   - [ ] Failed OCO with no orderListId (network timeout before response)
   - [ ] Multiple failed attempts for same trade
   - [ ] Phantom order already filled before cleanup
   - [ ] Cleanup fails (permissions error, network timeout)

---

## Risk Assessment

### Current State (Dangerous code removed)

**Risk**: Medium
- Balance may be locked by phantom orders
- Users must manually cancel phantom orders via Binance UI
- No automated cleanup

**Mitigation**:
- Users can check Binance UI for unexpected open orders
- Binance's order expiry will eventually clean up (GTC orders remain until filled/cancelled)
- Balance lock is temporary, not permanent

### After Safe Implementation

**Risk**: Low
- Only orders from current trade are cancelled
- Stop losses from other trades are preserved
- Automated cleanup reduces manual intervention

**Mitigation**:
- Comprehensive testing on testnet
- Logging for audit trail
- Monitoring alerts for phantom order detection

---

## Code Review Notes

### Security Considerations

1. **Order Ownership Verification**: CRITICAL
   - ALWAYS verify orderListId matches before cancelling
   - NEVER cancel orders without ownership check
   - Log all cancellations for audit trail

2. **Error Handling**:
   - Cleanup failures should NOT block new OCO creation
   - Log errors but continue execution
   - Store failed attempts for manual review

3. **Race Conditions**:
   - Multiple concurrent trades for same symbol
   - Ensure cleanup doesn't interfere with active orders
   - Use orderListId as unique identifier

### Performance Considerations

1. **API Rate Limits**:
   - `getOpenOrders()` counts toward API weight
   - `cancelOrder()` counts toward order rate limit
   - Cleanup should be efficient (batch operations if possible)

2. **Delay Impact**:
   - 2s settlement delay after cleanup
   - May slow down OCO creation by 2-4s per cleanup
   - Acceptable trade-off for safety

---

## Questions & Answers

**Q: Why not just increase the settlement delay instead of cleanup?**
A: Settlement delay only helps with balance updates from buy orders. Phantom orders from failed OCO attempts require explicit cancellation.

**Q: Can phantom orders fill while we're trying to cancel them?**
A: Yes. Cancellation may fail with error (order already filled). This is handled gracefully - we log the error and continue.

**Q: What if user manually cancels phantom order before cleanup?**
A: Cleanup will find no orders matching orderListId and skip. No harm done.

**Q: What if cleanup fails completely?**
A: We log the error and continue. User can manually cancel via Binance UI. Trade may fail due to locked balance, but no financial loss.

**Q: Why not use Binance's `cancelAllOrdersForSymbol()` endpoint?**
A: That would cancel ALL orders for the symbol, including legitimate ones from other trades. Same problem as before.

---

## References

- **Binance API Docs**: https://binance-docs.github.io/apidocs/spot/en/#new-oco-trade
- **OCO Order Structure**: https://binance-docs.github.io/apidocs/spot/en/#account-trade-list-user_data
- **Trade Executor Code**: `lib/binance/trade-executor.ts`
- **Binance Client Code**: `lib/binance/client.ts`
- **Trade Model**: `lib/db/models/Trade.ts`

---

**End of Proposal**
