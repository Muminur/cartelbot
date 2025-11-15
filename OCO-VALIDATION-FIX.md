# OCO Order Failure - Root Cause Analysis

**Date**: November 15, 2025
**Issue**: Binance error -2010 "Insufficient balance to execute this order"
**Actual Cause**: ❌ **NOT a balance issue** - it was **INVALID TARGET PRICES**

---

## 🔍 What Really Happened

### The Misleading Error
```
[OCO] NEARUSDT - Insufficient balance on attempt 3/3
Binance error -2010: Insufficient balance to execute this order
```

This error message from Binance is **misleading**. The real issue was that the OCO order violated Binance's price constraints.

---

## 📊 The Real Problem

### Binance OCO Rule for SELL Orders
From [Binance API Documentation](https://developers.binance.com/docs):

> **Price restrictions on the legs:**
> - **SELL**: `price > market price > stopPrice`

**Translation**: For a SELL OCO order:
- **Limit price (take profit)** must be **ABOVE** current market price
- **Stop price (stop loss)** must be **BELOW** current market price

### Your Signal
```
Signal created:
- Symbol: NEARUSDT
- Entries: [2.27, 2.124]
- Targets: [2.37, 2.51, 2.69, 2.82]
- Stop Loss: 2.05
- Current Market Price (at signal creation): 2.416

Validation at signal creation:
- Max entry: 2.27
- Min target: 2.37
- Check: 2.37 > 2.27 ✅ PASSED
```

**Signal was valid when created!**

### What Went Wrong

```
Market price moved UP before buy order executed:
- Signal entry: 2.27
- Actual buy execution: 2.422 (market went up!)
- Target #1: 2.37 ← NOW BELOW executed price!

OCO validation:
- Limit price: 2.37
- Market price: 2.422
- Check: 2.37 > 2.422? ❌ FAILED
- Binance: "This violates my rules, rejecting..."
- Error returned: -2010 (generic "insufficient balance" error)
```

**The problem**: Binance's error code -2010 is generic and doesn't tell you the REAL reason (invalid price constraints).

---

## ✅ The Fix

### Added Post-Execution Validation

**Location**: `lib/binance/trade-executor.ts` lines 225-243

```typescript
// After buy order executes, validate targets against EXECUTED price
const executedPrice = parseFloat(buyOrder.fills?.[0]?.price || "0"); // 2.422

const invalidTargets = signal.targets.filter(target => target <= executedPrice);
if (invalidTargets.length > 0) {
  throw new ValidationError(
    `Signal targets are invalid for OCO sell orders. ` +
    `Buy executed at ${executedPrice}, but ${invalidTargets.length} target(s) ` +
    `are below this price: ${invalidTargets.join(', ')}. ` +
    `For SELL OCO orders, target prices must be ABOVE the entry price. ` +
    `This can happen when market price moves up between signal creation and execution.`
  );
}
```

**Result**: Clear error message explaining the issue instead of misleading "insufficient balance"

---

## 🎯 What This Means for You

### Scenario 1: Signal Still Valid
If your signal targets are all above the buy price, OCO creation will proceed normally.

```
Buy executed at: 2.30
Targets: [2.37, 2.51, 2.69, 2.82]
Check: All targets > 2.30 ✅
Result: OCO orders created successfully
```

### Scenario 2: Signal Invalidated by Market Movement
If market price moved up significantly, you'll get a clear error:

```
Buy executed at: 2.50
Targets: [2.37, 2.51, 2.69, 2.82]
Invalid targets: [2.37] (below 2.50)
Result: Trade execution fails with clear explanation
```

**What to do**: Create a new signal with updated target prices above 2.50

---

## 📈 Example Flow

### Before Fix
```
1. Signal created: entry=2.27, target=2.37
2. Market moves up to 2.42
3. Buy executes at 2.422
4. Attempt OCO with limit price 2.37
5. Binance: "Insufficient balance" ❌ (misleading!)
6. User confused: "I have 76.40 NEAR available!"
```

### After Fix
```
1. Signal created: entry=2.27, target=2.37
2. Market moves up to 2.42
3. Buy executes at 2.422
4. Validation: target 2.37 < executed 2.422 ❌
5. Clear error: "Target 2.37 is below executed price 2.422"
6. User understands: "Market moved, need new signal"
```

---

## 🔧 Testing the Fix

### Test Case 1: Valid Signal (Targets Above Entry)
```
Create signal:
- Symbol: BTCUSDT
- Entry: 50000
- Targets: [51000, 52000, 53000]
- Stop Loss: 49000

Expected: Trade executes successfully, OCO orders created
```

### Test Case 2: Invalid Signal (Market Moved Up)
```
Create signal:
- Symbol: ETHUSDT
- Entry: 3000
- Targets: [3100, 3200]

But market moves to 3150 before buy executes.

Expected: Error with clear message about targets below executed price
```

---

## 📝 Key Takeaways

1. **Error -2010 is misleading** - Can mean balance issues OR price constraint violations
2. **Validate against EXECUTED price**, not signal entry price
3. **Market movements matter** - Price can change between signal creation and execution
4. **OCO rules are strict** - SELL limit price must be above market price

---

## 🚀 Next Steps

1. **Restart your dev server** to load the new validation code
2. **Test with a valid signal** (targets well above current market price)
3. **Monitor execution logs** for clearer error messages

If you see this error now:
```
Signal targets are invalid for OCO sell orders.
Buy executed at X, but N target(s) are below this price...
```

**Action**: Create a new signal with targets above the current market price.

---

**Commit**: a6e31c0
**File Modified**: `lib/binance/trade-executor.ts`
**Lines Added**: 225-243 (validation logic)
