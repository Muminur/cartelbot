
---

## Bug Fix: PRICE_FILTER Error in OCO Orders (Nov 12, 2025)

**Issue**: OCO order creation failing with Binance error -1013 (PRICE_FILTER failure)

**Root Cause**:
- `client.ts` was using `.toFixed(8)` for ALL prices regardless of symbol tick size
- `trade-executor.ts` was not validating stopLimitPrice and stopPrice against PRICE_FILTER
- Prices were being re-formatted after adjustment, breaking tick size alignment

**Fix Applied**:
1. Updated `lib/binance/client.ts` createOCOOrder() to fetch symbol filters and format prices with correct precision
2. Updated `lib/binance/trade-executor.ts` to validate stopPrice and stopLimitPrice through filter validation
3. Added comprehensive logging for debugging OCO order parameters

**Files Modified**:
- `lib/binance/client.ts` (lines 284-353)
- `lib/binance/trade-executor.ts` (lines 294-320)

**Status**: FIXED - TypeScript compilation passing

See `PRICE_FILTER_FIX.md` for complete technical details.
