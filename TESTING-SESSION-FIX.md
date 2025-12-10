# Testing Guide: Session Logout Fix

## Quick Summary

**Fix Applied**: Changed cookie `sameSite` from `strict` to `lax`
**File**: `lib/auth/cookies.ts` line 20
**Expected Result**: Users stay logged in when navigating from external links

---

## Before You Test

### 1. Restart Development Server

The cookie settings are applied when the server starts:

```bash
# Stop current server (Ctrl+C)
# Start fresh
npm run dev
```

**Important**: You MUST restart the server for cookie changes to take effect.

---

## Test Plan

### Test 1: External Link Navigation (PRIMARY TEST)

This tests the exact scenario that was causing logouts.

**Steps**:
1. Open browser (Chrome/Firefox/Edge)
2. Login to CartelBot
3. Verify you're on dashboard
4. Open Discord/Telegram in another tab
5. Post app URL in chat: `http://localhost:3000/dashboard`
6. Click the URL from Discord/Telegram

**Expected Result BEFORE fix**: ❌ Logged out (SessionExpiredModal shown)
**Expected Result AFTER fix**: ✅ Still logged in (dashboard loads)

---

### Test 2: Browser Bookmark

**Steps**:
1. Login to CartelBot
2. Bookmark the dashboard page (Ctrl+D)
3. Close browser completely
4. Reopen browser
5. Click bookmark

**Expected Result**: ✅ Still logged in

---

### Test 3: Copy/Paste URL

**Steps**:
1. Login to CartelBot
2. Copy URL from address bar
3. Open new browser tab
4. Paste URL and press Enter

**Expected Result**: ✅ Still logged in

---

### Test 4: Email Link

**Steps**:
1. Login to CartelBot
2. Send yourself email with app URL
3. Open email
4. Click link in email

**Expected Result**: ✅ Still logged in

---

### Test 5: Session Persistence (Multiple Tabs)

**Steps**:
1. Login in Tab 1
2. Open Tab 2 → navigate to app
3. Open Tab 3 → navigate to app
4. Refresh all tabs

**Expected Result**: ✅ All tabs remain logged in

---

### Test 6: WebSocket Connection

This tests the specific issue mentioned (WebSocket triggering logout).

**Steps**:
1. Login to CartelBot
2. Navigate to Dashboard (WebSocket auto-connects)
3. Open browser DevTools (F12)
4. Go to Network tab
5. Filter by "WS" (WebSocket)
6. Verify WebSocket connection active

**Expected Result**:
- ✅ WebSocket connected
- ✅ No 401 errors in console
- ✅ Dashboard data loads
- ✅ No SessionExpiredModal

---

### Test 7: Legitimate Logout (Verify Still Works)

**Steps**:
1. Login to CartelBot
2. Click "Logout" button in nav

**Expected Result**: ✅ Logged out correctly

---

## Monitoring During Testing

### Check Browser DevTools

Open DevTools (F12) → Application tab → Cookies:

**Look for**:
```
Name: session
Value: (JWT token)
SameSite: Lax  ← Should say "Lax" not "Strict"
HttpOnly: ✓
Secure: (depends on HTTPS)
```

### Check Server Logs

Watch terminal where `npm run dev` is running:

**Good logs** (successful auth):
```
[auth-1702345678-abc123] Session cookie found (length: 187)
[auth-1702345678-abc123] JWT verified successfully
[auth-1702345678-abc123] Database connected in 45ms
[auth-1702345678-abc123] Authentication successful
```

**Bad logs** (logout):
```
[auth-1702345679-def456] No session cookie found
```

---

## What Changed (Technical)

### Before Fix
```typescript
sameSite: "strict",  // Blocks ALL cross-site cookies
```

**Behavior**:
- User clicks Discord link → Cookie blocked
- User clicks email link → Cookie blocked
- User uses bookmark → Cookie blocked
- Result: Appears logged out

### After Fix
```typescript
sameSite: "lax",     // Allows cookies on top-level navigation
```

**Behavior**:
- User clicks Discord link → Cookie sent ✅
- User clicks email link → Cookie sent ✅
- User uses bookmark → Cookie sent ✅
- Result: Stays logged in

**Security Note**: Both `lax` and `strict` prevent CSRF. The difference is UX, not security.

---

## Common Issues & Solutions

### Issue 1: Still Getting Logged Out

**Possible Causes**:
1. Server not restarted → Restart `npm run dev`
2. Old cookies cached → Clear browser cookies
3. Different issue → Check server logs for error

**Debug Steps**:
```bash
# 1. Verify fix is applied
cat lib/auth/cookies.ts | grep sameSite
# Should show: sameSite: "lax",

# 2. Check server is running fresh build
# Stop server, clear cache, restart
rm -rf .next
npm run dev
```

### Issue 2: Cookie Shows "Strict" in DevTools

**Cause**: Browser cached old cookie

**Solution**:
1. F12 → Application → Cookies
2. Delete "session" cookie
3. Login again
4. Verify cookie now shows "Lax"

### Issue 3: Database Timeout Errors

**If you see**:
```
[auth-xxx] Database connected in 2500ms
```

**This is a separate issue**. The sameSite fix won't help database timeouts.

**Solution**: See `docs/SESSION-LOGOUT-ANALYSIS.md` section "Fix #2: Database Timeouts"

---

## Advanced Monitoring

### Run Real-Time Monitor (Optional)

In separate terminal:
```bash
node scripts/monitor-auth-failures.js
```

This will track:
- Authentication attempts
- JWT failures
- Database errors
- Statistics every 30s

Press Ctrl+C to stop and see final report.

---

## Success Criteria

✅ **Fix Successful If**:
1. Test 1 (External Link) passes - no logout
2. Test 2 (Bookmark) passes - stays logged in
3. Test 6 (WebSocket) passes - no 401 errors
4. Server logs show no JWT verification failures
5. Cookie in DevTools shows "SameSite: Lax"

❌ **Fix Failed If**:
1. Still getting logged out on external links
2. Cookie still shows "SameSite: Strict"
3. Server logs show JWT verification failures
4. WebSocket shows 401 errors

---

## Reporting Results

After testing, please provide:

### If Tests Pass ✅
```
✅ Test 1 (External Link): PASS
✅ Test 2 (Bookmark): PASS
✅ Test 6 (WebSocket): PASS
✅ Cookie shows SameSite: Lax
✅ No logout issues observed
```

### If Tests Fail ❌
```
❌ Test 1 (External Link): FAIL - logged out
Server logs: [copy error messages]
Cookie SameSite value: [Strict/Lax]
Browser: [Chrome 120 / Firefox 121 / etc]
Steps to reproduce: [exact steps]
```

---

## Next Steps After Testing

### If Fix Works
1. Commit changes
2. Deploy to production
3. Monitor for 1 week
4. Mark issue as resolved

### If Fix Doesn't Work
1. Share test results (see above)
2. Run full diagnostic: `node scripts/diagnose-session-logout.js`
3. Check for database timeout issues
4. Review server logs for patterns

---

## Rollback (If Needed)

If fix causes problems:

```bash
# Revert file
git checkout lib/auth/cookies.ts

# Restart server
npm run dev
```

---

**Estimated Testing Time**: 10-15 minutes
**Priority Tests**: Test 1, 2, and 6
**Critical Success**: Test 1 must pass

---

**Last Updated**: December 10, 2025
