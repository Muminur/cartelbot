# OCO System - Critical Fixes Required

**Date**: November 17, 2025
**Priority**: HIGH - Must fix before production deployment
**Estimated Time**: 4-6 hours

---

## Summary

The OCO orders management system has **4 critical bugs** that can cause:
- Browser hangs from infinite re-renders
- Memory leaks from accumulated intervals
- Security vulnerabilities from NoSQL injection
- Incorrect pagination data

These issues are **easily fixable** and mostly involve React hooks best practices.

---

## Critical Issue #1: Infinite Re-render Risk 🔴

**File**: `app/oco/page.tsx` lines 84-116
**Impact**: Browser hang, excessive API calls, poor performance

### The Problem
```typescript
// BAD: filters object changes reference on every state update
const fetchOrders = useCallback(async () => {
  const params = new URLSearchParams({
    symbol: filters.symbol,  // ❌ filters is object literal
    status: filters.status,
    network: filters.network,
  });
  // ... fetch logic
}, [user, filters]); // ❌ fetchOrders recreates when filters change

useEffect(() => {
  if (!user) return;
  fetchOrders(); // ❌ Can trigger feedback loop
}, [user, fetchOrders]); // ❌ fetchOrders in deps
```

### The Fix
```typescript
// GOOD: Remove fetchOrders from effect deps
useEffect(() => {
  if (!user) return;
  fetchOrders();
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [user]); // ✅ Only re-run when user changes

// fetchOrders is stable due to useCallback, safe to omit from deps
```

**Time to fix**: 5 minutes

---

## Critical Issue #2: Memory Leak - Price Auto-refresh 🔴

**File**: `app/oco/page.tsx` lines 172-180
**Impact**: Memory leak, browser slowdown, excessive API calls

### The Problem
```typescript
// BAD: Creates new interval on every orders update
useEffect(() => {
  if (orders.length === 0) return;

  const interval = setInterval(() => {
    refreshPrices(); // ❌ Captures stale orders in closure
  }, 10000);

  return () => clearInterval(interval);
}, [orders]); // ❌ orders array changes frequently - interval recreated
```

**Result**: After 10 minutes with data changing every 10 seconds:
- 60 intervals running simultaneously
- 60 × API calls every 10 seconds
- Browser memory leak

### The Fix
```typescript
// GOOD: Use ref to track latest orders, stable interval
const ordersRef = useRef(orders);

useEffect(() => {
  ordersRef.current = orders; // ✅ Update ref on every render
}, [orders]);

useEffect(() => {
  const interval = setInterval(() => {
    if (ordersRef.current.length > 0) {
      refreshPrices(ordersRef.current); // ✅ Always uses latest orders
    }
  }, 10000);

  return () => clearInterval(interval); // ✅ Only one cleanup
}, []); // ✅ Empty deps - interval created ONCE
```

**Time to fix**: 10 minutes

---

## Critical Issue #3: NoSQL Injection via Regex 🔴

**File**: `app/api/oco/route.ts` lines 54-57
**Impact**: Security vulnerability, potential data disclosure, performance DoS

### The Problem
```typescript
// BAD: User input directly in regex
if (symbol) {
  query.symbol = { $regex: symbol, $options: "i" };
  // ❌ User can input: .*  (matches everything)
  // ❌ User can input: (a|b){50} (ReDoS attack)
}
```

**Attack Examples**:
```
?symbol=.*
→ Matches ALL symbols, returns all OCO orders (slow query)

?symbol=(BTC|ETH|BNB){100}
→ Catastrophic backtracking (server CPU 100%)
```

### The Fix
```typescript
// SOLUTION 1: Escape regex special characters
if (symbol) {
  const escapedSymbol = symbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  query.symbol = { $regex: `^${escapedSymbol}`, $options: "i" };
  // ✅ Only matches start of string, escaped
}

// SOLUTION 2 (RECOMMENDED): Use exact match
if (symbol) {
  query.symbol = symbol.toUpperCase();
  // ✅ Binance symbols are always uppercase (BTCUSDT)
  // ✅ No regex = much faster query
}
```

**Time to fix**: 10 minutes

---

## Critical Issue #4: Pagination Mismatch 🔴

**File**: `app/api/oco/route.ts` lines 74-146
**Impact**: Incorrect total count, wrong page numbers, confusing UX

### The Problem
```typescript
// BAD: Paginate trades, but return OCO orders
const [trades, total] = await Promise.all([
  Trade.find(query)
    .skip((page - 1) * limit) // ❌ Skips TRADES
    .limit(limit)              // ❌ Limits TRADES
  // ...
  Trade.countDocuments(query), // ❌ Counts TRADES
]);

// Transform trades to OCO orders (1 trade → 2-5 OCO orders)
const ocoOrders: any[] = [];
ordersByListId.forEach((orders, orderListId) => {
  ocoOrders.push({ /* OCO order */ }); // ❌ Returns OCO count
});

return NextResponse.json({
  pagination: {
    total,  // ❌ Total TRADES (not OCO orders!)
    totalOCOOrders: ocoOrders.length, // ❌ Only current page
    pages: Math.ceil(total / limit), // ❌ Pages based on trades
  },
});
```

**Example Bug**:
```
Scenario:
- 100 trades in DB
- Each trade has 2 OCO orders (200 total OCO orders)
- Limit: 20 trades per page

Current behavior:
{
  data: [40 OCO orders],  // ✅ Correct
  pagination: {
    total: 100,            // ❌ Should be 200 (OCO count)
    totalOCOOrders: 40,    // ❌ Should be 200 (all OCO orders)
    pages: 5               // ❌ Based on trades, not OCO
  }
}

User sees: "Showing 40 of 100" (confusing!)
Should see: "Showing 40 of 200"
```

### The Fix
```typescript
// SOLUTION 1: Fetch all, then paginate OCO orders
const allTrades = await Trade.find(query).lean();

// Transform ALL trades to OCO orders first
const allOCOOrders: OCOOrder[] = [];
for (const trade of allTrades) {
  const ordersByListId = groupOrdersByListId(trade.sellOrders);
  ordersByListId.forEach((orders, orderListId) => {
    allOCOOrders.push(createOCOOrder(trade, orderListId, orders));
  });
}

// NOW paginate the OCO orders
const paginatedOCO = allOCOOrders.slice(
  (page - 1) * limit,
  page * limit
);

return NextResponse.json({
  data: paginatedOCO,
  pagination: {
    page,
    limit,
    total: allOCOOrders.length, // ✅ Correct OCO count
    pages: Math.ceil(allOCOOrders.length / limit), // ✅ Correct pages
  },
});

// Note: For large datasets, use MongoDB aggregation instead
```

**Time to fix**: 30 minutes

---

## Critical Issue #5: Memory Leak - Detail Page Auto-refresh 🔴

**File**: `app/oco/[orderListId]/page.tsx` lines 114-123
**Impact**: Same as Issue #2, plus race conditions

### The Problem
```typescript
// BAD: Creates new interval every time data updates
useEffect(() => {
  if (!ocoStatus) return;

  const interval = setInterval(() => {
    fetchOrderDetails(); // ❌ Not in deps (ESLint violation)
  }, 10000);

  return () => clearInterval(interval);
}, [ocoStatus]); // ❌ ocoStatus changes on every fetch
```

### The Fix
```typescript
// GOOD: Stable interval with ref
const fetchRef = useRef(fetchOrderDetails);

useEffect(() => {
  fetchRef.current = fetchOrderDetails; // ✅ Update ref on render
}, [fetchOrderDetails]);

useEffect(() => {
  const interval = setInterval(() => {
    fetchRef.current(); // ✅ Always calls latest function
  }, 10000);

  return () => clearInterval(interval); // ✅ Only one cleanup
}, []); // ✅ Empty deps - created once
```

**Time to fix**: 10 minutes

---

## Testing Checklist

After applying fixes, test:

### Memory Leak Tests
- [ ] Open OCO list page
- [ ] Let it run for 5 minutes
- [ ] Open browser dev tools → Performance Monitor
- [ ] Check "JS heap size" - should be stable, not growing
- [ ] Check Network tab - should be ~2 requests/10s (not 20+)

### Pagination Tests
- [ ] Create 50 trades with OCO orders (100+ OCO total)
- [ ] Navigate to `/oco?limit=20`
- [ ] Verify `total` matches actual OCO count
- [ ] Navigate through all pages
- [ ] Verify no OCO orders are skipped or duplicated

### Security Tests
- [ ] Try `?symbol=.*` - should return 0 results (not all)
- [ ] Try `?symbol=(a|b){50}` - should return quickly (not hang)
- [ ] Try `?symbol=BTC` - should match BTCUSDT (case-insensitive)

### Re-render Tests
- [ ] Open browser dev tools → React DevTools → Profiler
- [ ] Record interaction while changing filters
- [ ] Verify components don't re-render unnecessarily
- [ ] Should see max 2-3 renders per filter change

---

## Additional Recommendations (Non-critical)

### Add Missing ESLint Suppression
```typescript
// app/oco/[orderListId]/page.tsx:109-112
useEffect(() => {
  if (!user || !orderListId) return;
  fetchOrderDetails();
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [user, orderListId]);
```

### Replace `any` Types
```typescript
// Define proper interfaces
interface OCOOrder {
  orderListId: number;
  symbol: string;
  orders: Array<{
    orderId: number;
    type: string;
    price: number;
    stopPrice?: number;
    quantity: number;
    status: string;
  }>;
  status: string;
  createdAt: string;
  testnet: boolean;
}

const ocoOrders: OCOOrder[] = []; // ✅ Not any[]
```

---

## Summary of Changes Required

| File | Lines | Change | Time | Priority |
|------|-------|--------|------|----------|
| `app/oco/page.tsx` | 84-116 | Remove fetchOrders from deps | 5 min | CRITICAL |
| `app/oco/page.tsx` | 172-180 | Fix interval memory leak | 10 min | CRITICAL |
| `app/api/oco/route.ts` | 54-57 | Sanitize regex input | 10 min | CRITICAL |
| `app/api/oco/route.ts` | 74-146 | Fix pagination logic | 30 min | CRITICAL |
| `app/oco/[orderListId]/page.tsx` | 114-123 | Fix interval memory leak | 10 min | CRITICAL |
| `app/oco/[orderListId]/page.tsx` | 109-112 | Add ESLint suppression | 2 min | HIGH |

**Total Time**: ~1.5 hours for critical fixes
**Full Cleanup**: ~4-6 hours with type safety improvements

---

## Next Steps

1. ✅ Review this document
2. ✅ Create Git branch: `fix/oco-critical-issues`
3. ✅ Apply fixes one by one (test after each)
4. ✅ Run full test suite
5. ✅ Request code review
6. ✅ Merge to main

---

**Need Help?** See detailed explanations in `CODE_REVIEW_OCO_SYSTEM.md`
