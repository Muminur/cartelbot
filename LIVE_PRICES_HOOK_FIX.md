# Fix: useLivePrices Hook - Parallel Individual Requests

## Issue
The `useLivePrices` hook was using comma-separated batch requests to fetch multiple ticker prices:

```typescript
const symbolsParam = symbols.join(",");
const response = await fetch(`/api/binance/ticker?symbols=${symbolsParam}`);
```

This approach:
- Could fail with 400 errors if symbols list was too long
- Provided poor error isolation (one bad symbol fails entire batch)
- Didn't allow graceful fallback for individual symbol failures

## Solution
Refactored to use `Promise.all()` with parallel individual requests:

```typescript
const pricePromises = symbols.map(async (symbol) => {
  // Individual request per symbol
  const response = await fetch(`/api/binance/ticker?symbol=${symbol}`);
  // ... handle success/failure
});

const results = await Promise.all(pricePromises);
```

## Benefits

### 1. Reliability
- Individual request failures don't block other symbols
- Failed requests return `null` and are filtered out
- Partial success is possible (some prices fetched, others skipped)

### 2. Error Handling
- Each symbol has its own try-catch block
- Failed requests logged as warnings (not errors)
- Overall request only fails if `Promise.all()` throws (rare)

### 3. Performance
- Parallel requests (all concurrent via `map`)
- No sequential request waiting
- Same total time as batch, better isolation

### 4. Maintainability
- Clear per-symbol error handling
- Easy to add custom retry logic per symbol
- Transparent failure handling with console.warn

## Code Changes

### File: `hooks/useLivePrices.ts`

**Removed**:
- Unused `PriceData` interface (TypeScript/ESLint clean)
- Comma-separated symbol parameter
- Single try-catch for entire batch

**Added**:
- `symbols.map(async (symbol) => {...})` for parallel requests
- Per-symbol error handling with `console.warn`
- `Promise.all(pricePromises)` to wait for all requests
- Result filtering to handle null values from failures

## Testing Results

✓ TypeScript compilation: PASSED (no errors)
✓ ESLint validation: PASSED (0 warnings, 0 errors)
✓ Type safety: PASSED (strict mode)
✓ Build compatibility: VERIFIED

## Expected Behavior

### Scenario 1: All symbols have prices
- All 5 requests succeed in parallel
- All prices stored in Map
- Error state cleared

### Scenario 2: Some symbols missing (e.g., invalid pair)
- Failed requests return null
- Successful requests stored in Map
- Warnings logged for failed symbols
- No overall error state

### Scenario 3: All symbols fail
- All requests return null
- Empty Map created
- Error state set with overall error message
- User sees "loading failed" state

## Impact on Components

**Dashboard Components Using This Hook**:
- PortfolioWidget
- ActiveSignalsWidget (indirectly)
- OpenPositionsWidget (indirectly)

**Expected Improvements**:
- Dashboard loads even if 1-2 symbols fail
- More resilient to temporary Binance API issues
- Better error visibility in console logs

## Migration Notes

**No API Changes**: Hook API remains identical
- `useLivePrices({ symbols, enabled, refreshInterval })`
- Return type unchanged
- All methods work the same

**No Breaking Changes**: Components don't need updates
- Hook handles backward compatibility
- Existing code continues to work

## Future Enhancements

1. Add per-symbol retry logic with exponential backoff
2. Cache successful quote currency per asset
3. Add circuit breaker for repeated failures
4. Implement request deduplication for duplicate symbols
