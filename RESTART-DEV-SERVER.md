# Dev Server Restart Required - CRITICAL FIX

## URGENT: OCO Pages Showing "API Keys Not Configured" (November 18, 2025)

### Issue
OCO pages showing "API keys not configured" warning even though you've saved API keys in Settings.

### Root Cause
Your dev server is running **OLD code from before commit 3041aab** (OCO status API field fix).

The fix changed:
- ❌ OLD: Checking `user.binance.apiKey` (undefined)
- ✅ NEW: Checking `user.encryptedApiKey` (correct field)

### Solution: RESTART NOW
```bash
# Press Ctrl+C to stop dev server
npm run dev
```

Then hard refresh browser: `Ctrl+Shift+R` (Windows) or `Cmd+Shift+R` (Mac)

### What Was Fixed (Commit 3041aab)

**Session API** (app/api/auth/session/route.ts):
```typescript
// Line 20 - Correctly checks encryptedApiKey/encryptedApiSecret
hasApiKeys: !!(user.encryptedApiKey && user.encryptedApiSecret),
```

**OCO Status API** (app/api/trades/oco-status/[orderListId]/route.ts):
- Changed from checking `user.binance.apiKey` → `user.encryptedApiKey`
- Changed from checking `user.binance.apiSecret` → `user.encryptedApiSecret`

### Expected After Restart:
1. ✅ No "API keys not configured" warnings on /oco pages
2. ✅ OCO order status fetches from Binance successfully
3. ✅ Live price updates every 10 seconds
4. ✅ Signal details display correctly

---

## Previous Issue: Settings Page Environment Variables (November 16, 2025)
The /settings page is STILL showing "Invalid environment variables" error even after previous fixes. Root cause identified: `lib/config/env.ts` being bundled into client code via import chain.

## What Was Fixed (Latest)
**Root Cause**: `PortfolioWidget.tsx` → `@/lib/binance/helpers` → `lib/binance/index.ts` → `lib/binance/client.ts` → `env.ts`

**Solution**:
- Created `lib/utils/stablecoins.ts` (client-safe utility with zero dependencies)
- Updated `lib/binance/helpers.ts` to re-export from client-safe location
- Updated `PortfolioWidget.tsx` to import from `lib/utils/stablecoins` directly
- Broke import chain preventing `env.ts` from bundling into client code

## Previous Fixes (Still Valid)
- Removed `PAYMENT_WALLET_ADDRESS` import from client-side code
- Created `/api/subscription/wallet` endpoint to serve wallet address
- Updated `SubscriptionSection.tsx` to fetch wallet address from API

## Solution: Restart Dev Server

**Steps:**

1. Stop the currently running dev server (Ctrl+C or Command+C)

2. Delete the .next cache directory (already done):
   ```bash
   rm -rf .next
   ```

3. Restart the dev server:
   ```bash
   npm run dev
   ```

4. Navigate to http://localhost:3000/settings

5. The page should now load without errors and the wallet address will be fetched from the API

## Technical Details

The error occurred because:
- Next.js Turbopack cached the old bundle with the `PAYMENT_WALLET_ADDRESS` import
- Hot reload didn't catch the import removal in lib/subscription/constants.ts
- The browser was still loading the old chunk with env validation code

After restart:
- Fresh build will use updated code
- Client-side bundle will NOT include env validation
- Wallet address fetched from `/api/subscription/wallet` endpoint
- No more "Invalid environment variables" error

## Verification

After restarting, verify:
- [x] .next directory deleted
- [ ] Dev server restarted successfully
- [ ] /settings page loads without error
- [ ] Wallet address displays (or shows "Loading...")
- [ ] Copy button works when wallet address loads
