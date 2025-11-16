# Quick Debugging Guide: Trade Execution Issues

## Symptom: currentMarketPrice is undefined

**What to Check**:
```bash
# Search server logs for signal creation
grep "\[Signal Creation\]" server.log

# Expected output:
[Signal Creation] Fetching current market price for ROSEUSDT from mainnet...
[Signal Creation] Current market price for ROSEUSDT: 0.04190
```

**If NOT found**:
- Signal creation endpoint not calling Binance API
- Check `app/api/signals/route.ts` has BinanceClient import
- Verify `currentMarketPrice` variable is used (not `parsed.currentMarketPrice`)

**If found but failed**:
```
[Signal Creation] Failed to fetch current price for ROSEUSDT: Network timeout
```
- Binance API unreachable
- Check network connectivity: `curl https://api.binance.com/api/v3/ping`
- Signal will still be created with `currentMarketPrice: undefined`

---

## Symptom: Buy order appears to have failed

**What to Check**:
```bash
# Search for buy order execution logs
grep "\[Trade Executor\] Buy order" server.log

# Expected output:
[Trade Executor] Executing buy order for ROSEUSDT: { investmentAmount: 100, ... }
[Trade Executor] Buy order executed successfully: { orderId: 12345, executedQty: '2380.90', ... }
[Trade Executor] Buy order processed: { executedQuantity: 2380.9, ... }
```

**If NOT found**:
- Trade execution never reached buy order step
- Check earlier errors:
  ```bash
  grep "Trade execution failed" server.log
  ```
- Common causes:
  - Insufficient USDT balance (error -2010)
  - Invalid API keys (error -2015)
  - Timestamp sync failure (error -1021)

**If executedQty is 0**:
```
[Trade Executor] Buy order executed successfully: { executedQty: '0.00000000', ... }
ERROR: Buy order executed with 0 quantity. Order ID: 12345.
```
- Binance rejected the order (likely filter validation failure)
- Check symbol trading status on Binance
- Verify investment amount meets MIN_NOTIONAL filter

---

## Symptom: OCO trying to sell wrong quantity

**What to Check**:
```bash
# Search for OCO creation logs
grep "\[OCO Creation\]" server.log
grep "\[OCO\].*Balance check" server.log

# Expected output:
[OCO Creation] Starting OCO order creation: { buyQuantity: 2380.9, ... }
[OCO] ROSEUSDT - Balance check for ROSE:
  Available=2380.90000000,
  Required (from buy order)=2380.90000000,
  Buy Order ID=12345,
  Buy Order Executed Qty=2380.90000000,
  Shortfall=0.00000000
```

**If quantities don't match**:
```
[OCO] ROSEUSDT - MISMATCH DETECTED:
  trade.quantity (4633.9) !== buyOrder.executedQty (2380.9)
```

**Root Causes**:
1. **Buy order partial fill**: Binance filled less than requested
   - Check buy order status in logs: `status: 'PARTIALLY_FILLED'`
   - This is NORMAL behavior - OCO should use partial quantity

2. **Data corruption**: Trade document saved incorrectly
   - Check Trade document in MongoDB:
     ```javascript
     db.trades.findOne({ _id: ObjectId("...") })
     ```
   - Verify `quantity` matches `buyOrder.executedQty`

3. **Settlement delay (testnet)**: Balance not updated yet
   - Check logs for settlement delay:
     ```
     [Trade Execute] Testnet mode detected - waiting 3000ms for balance settlement
     ```
   - If still failing, increase `TESTNET_SETTLEMENT_DELAY_MS` in constants

**If Available < Required**:
```
[OCO] ROSEUSDT - Balance check for ROSE:
  Available=0.00000000,
  Required (from buy order)=2380.90000000,
  Shortfall=2380.90000000

ERROR: Insufficient ROSE balance for OCO orders.
```

**Root Causes**:
1. **Buy order never executed**: Check buy order logs above
2. **Settlement delay**: More common on testnet
   - Will retry with exponential backoff (2s, 4s, 8s)
   - Check for retry logs:
     ```
     [OCO] ROSEUSDT - Insufficient balance on attempt 1/3. Retrying in 2000ms...
     ```
3. **Balance already locked**: Check `Locked` balance in logs
   - If `Locked > 0`, previous OCO may still be active
   - Cancel old OCO orders before creating new ones

---

## Symptom: OCO allocation mismatch (110% allocation)

**What to Check**:
```bash
# Search for allocation warnings
grep "OCO allocation mismatch" server.log

# Example issue:
OCO allocation mismatch for ROSEUSDT: {
  buyQuantity: 2380.90000000,
  allocatedQuantity: 2619.00000000,  // 110%!
  unallocatedQuantity: -238.10000000,
  allocationPercentage: 110.00%,
  successfulOrders: 4,  // Should be 3 max
  totalTargets: 5
}
```

**Root Cause**: More than 3 OCO orders created (distribution is [75, 15, 10] = 100%)

**Fix Applied**:
```typescript
const maxOCOOrders = distribution.length; // Limit to 3
const targets = trade.targets.slice(0, maxOCOOrders); // Take only first 3 targets
```

**Verify**:
- Check `successfulOrders` in logs (should be ≤ 3)
- Check `allocationPercentage` (should be ≈ 100%)
- If > 100%, check `TRADE_DEFAULTS.TARGET_DISTRIBUTION` in constants

---

## Diagnostic Commands

### Check Binance Connectivity
```bash
# Mainnet
curl https://api.binance.com/api/v3/ping
# Expected: {}

# Testnet
curl https://testnet.binance.vision/api/v3/ping
# Expected: {}
```

### Check Server Time Sync
```bash
# Get Binance server time
curl https://api.binance.com/api/v3/time
# Expected: {"serverTime":1731427856123}

# Compare with local time
date +%s%3N
# Should be within 5000ms
```

### Check Symbol Trading Status
```bash
# Replace ROSEUSDT with your symbol
curl "https://api.binance.com/api/v3/exchangeInfo?symbol=ROSEUSDT" | jq '.symbols[0].status'
# Expected: "TRADING"
```

### Check Account Balance (requires API keys)
```bash
# Mainnet
curl -X GET "https://api.binance.com/api/v3/account" \
  -H "X-MBX-APIKEY: YOUR_API_KEY" \
  # ... (needs signature)

# Or use test script:
node check-testnet-balance.js
```

---

## Common Error Codes

| Code | Message | Cause | Solution |
|------|---------|-------|----------|
| -1021 | Timestamp for this request is outside of the recvWindow | Server time out of sync | Run `client.syncServerTime()` |
| -2010 | Account has insufficient balance | Not enough USDT/asset | Check balance before trade |
| -2015 | Invalid API-key, IP, or permissions | API key issue | Verify key, check IP whitelist |
| -1013 | Filter failure: PRICE_FILTER | Price precision wrong | Use `validateAllFilters()` |
| -1013 | Filter failure: MIN_NOTIONAL | Order value too small | Increase investment amount |
| -1121 | Invalid symbol | Symbol doesn't exist | Check symbol exists on Binance |

---

## Log Search Patterns

```bash
# Find all errors
grep -i "error" server.log | grep -i "trade"

# Find failed trades
grep "Trade execution failed" server.log

# Find OCO errors
grep "\[OCO\]" server.log | grep -i "error\|fail\|insufficient"

# Find signal creation issues
grep "POST /api/signals" server.log -A 10

# Find buy order details
grep "Buy order executed successfully" server.log -A 5

# Find mismatches
grep "MISMATCH" server.log

# Find settlement delays
grep "Testnet mode detected" server.log
```

---

## Production Monitoring

**Key Metrics to Track**:
1. `currentMarketPrice` undefined rate (should be 0%)
2. Buy order zero quantity rate (should be 0%)
3. OCO mismatch warnings (should be 0%)
4. Average buy order execution time (< 2s mainnet, < 5s testnet)
5. OCO creation success rate (> 95%)

**Alerting Thresholds**:
- Alert if > 5% of signals have undefined `currentMarketPrice`
- Alert if > 1% of buy orders have zero quantity
- Alert if any OCO mismatch warnings occur
- Alert if OCO creation fails > 10% of time

---

## Quick Fixes

### If currentMarketPrice fetch fails consistently
```typescript
// Add timeout to Binance client
const mainnetClient = new BinanceClient({
  apiKey: "",
  apiSecret: "",
  testnet: false,
  timeout: 10000, // 10s timeout
});
```

### If settlement delays are too long
```typescript
// Increase delay in lib/constants.ts
export const TRADE_EXECUTION = {
  TESTNET_SETTLEMENT_DELAY_MS: 5000, // Increase from 3000ms
  // ...
};
```

### If OCO allocation still > 100%
```typescript
// Verify distribution sums to 100
const distribution = TRADE_DEFAULTS.TARGET_DISTRIBUTION;
const sum = distribution.reduce((a, b) => a + b, 0);
console.assert(sum === 100, `Distribution must sum to 100, got ${sum}`);
```

---

**Last Updated**: November 12, 2025
