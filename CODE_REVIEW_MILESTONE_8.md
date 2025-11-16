# Code Review: Milestone 8 - Subscription System

**Review Date**: November 15, 2025
**Reviewer**: Claude Code (Automated Code Review)
**Scope**: All Milestone 8 implementation files

---

## Executive Summary

**Overall Assessment**: 7.2/10 - Production-ready with critical fixes required

**Total Issues Found**: 18
- Critical: 4
- High: 6
- Medium: 5
- Low: 3

**Code Statistics**:
- New Files: 11
- Modified Files: 2
- Total Lines Added: ~1,800 LOC
- TypeScript Errors: 6 (model deletion pattern)

---

## Critical Issues (4)

### C1. TypeScript Compilation Errors - Model Deletion Pattern
**File**: All 6 models (User, Signal, Trade, Subscription, OrphanedCoin, WebSocketSession)
**Severity**: Critical
**Lines**: 85-87 (each model file)

**Issue**:
```typescript
if (process.env.NODE_ENV === "development" && mongoose.models.Subscription) {
  delete mongoose.models.Subscription;  // TS2542: Index signature only permits reading
  delete mongoose.connection.models.Subscription;
}
```

**Impact**: TypeScript strict mode compilation fails. Build process broken.

**Root Cause**: `mongoose.models` is readonly in TypeScript 5.3+

**Fix Required**:
```typescript
if (process.env.NODE_ENV === "development") {
  // Use type assertion to bypass readonly restriction
  const models = mongoose.models as { [key: string]: any };
  if (models.Subscription) {
    delete models.Subscription;
  }
  const connectionModels = mongoose.connection.models as { [key: string]: any };
  if (connectionModels.Subscription) {
    delete connectionModels.Subscription;
  }
}
```

**Files to Fix**:
- lib/db/models/User.ts:126
- lib/db/models/Signal.ts:88
- lib/db/models/Trade.ts:169
- lib/db/models/Subscription.ts:87
- lib/db/models/OrphanedCoin.ts:88
- lib/db/models/WebSocketSession.ts:55

---

### C2. Hardcoded Production Wallet Address
**File**: lib/subscription/constants.ts:75
**Severity**: Critical (Security Risk)

**Issue**:
```typescript
export const PAYMENT_WALLET_ADDRESS = "TYourWalletAddressHere123456789ABCDEF";
```

**Impact**:
- Placeholder wallet address exposed in production code
- Payments would be sent to invalid address
- No environment variable validation

**Fix Required**:
1. Move to environment variable:
```typescript
export const PAYMENT_WALLET_ADDRESS =
  process.env.PAYMENT_WALLET_ADDRESS || "";

// Add validation in env.ts
PAYMENT_WALLET_ADDRESS: z
  .string()
  .regex(/^T[a-zA-Z0-9]{33}$/, "Invalid TRC20 wallet address")
  .refine(
    (val) => val !== "TYourWalletAddressHere123456789ABCDEF",
    "Production wallet address not configured"
  ),
```

2. Add runtime check in POST /api/subscriptions:
```typescript
if (!PAYMENT_WALLET_ADDRESS || PAYMENT_WALLET_ADDRESS.startsWith("TYour")) {
  throw new Error("Payment wallet not configured");
}
```

---

### C3. Transaction Hash Validation Mismatch
**File**: app/api/subscriptions/route.ts:105-106
**Severity**: Critical

**Issue**:
```typescript
// API endpoint validation (line 105)
if (!txHash || typeof txHash !== "string" || txHash.length !== 64) {
  // Expects 64 characters WITHOUT "0x" prefix
}

// Model validation (Subscription.ts:35)
validator: (hash: string) => !hash || /^(0x)?[0-9a-fA-F]{64}$/.test(hash)
// Accepts BOTH with and without "0x" prefix (66 or 64 chars)

// Frontend validation (SubscriptionSection.tsx:103)
if (!txHash || txHash.length !== 64) {
  // Expects 64 characters WITHOUT "0x" prefix
}
```

**Impact**:
- TRON txHash is always 64 hex characters WITHOUT "0x" prefix
- Model validation incorrectly accepts Ethereum-style "0x" prefix
- Database could store invalid TRC20 transaction hashes

**Fix Required** (lib/db/models/Subscription.ts:34-37):
```typescript
txHash: {
  type: String,
  validate: {
    validator: (hash: string) => !hash || /^[0-9a-fA-F]{64}$/.test(hash),
    message: "Invalid TRC20 transaction hash (must be 64 hex characters)",
  },
},
```

---

### C4. Missing Subscription Expiry Cleanup Job
**File**: N/A - Feature not implemented
**Severity**: Critical (Data Integrity)

**Issue**: No cron job or background process to mark expired subscriptions and downgrade users.

**Impact**:
- Users with expired subscriptions continue using premium features
- Database fills with "confirmed" subscriptions that should be "expired"
- Revenue loss from users not renewing

**Fix Required**: Create background job

**File**: lib/subscription/expiry-checker.ts (NEW FILE)
```typescript
import { connectDB } from "@/lib/db/connection";
import { Subscription } from "@/lib/db/models/Subscription";
import { User } from "@/lib/db/models/User";

export async function checkExpiredSubscriptions() {
  await connectDB();

  const now = new Date();

  // Find expired subscriptions still marked as "confirmed"
  const expiredSubs = await Subscription.find({
    status: "confirmed",
    endDate: { $lt: now },
  });

  for (const sub of expiredSubs) {
    // Mark subscription as expired
    sub.status = "expired";
    await sub.save();

    // Downgrade user to free tier
    await User.findByIdAndUpdate(sub.userId, {
      subscriptionTier: "free",
      subscriptionExpiry: null,
    });

    // TODO: Send expiry notification email
  }

  console.log(`Expired ${expiredSubs.length} subscriptions`);
}
```

**Recommended**: Run daily via cron (Node-cron) or Vercel Cron Jobs

---

## High Priority Issues (6)

### H1. No Payment Verification Against Blockchain
**File**: app/api/admin/subscriptions/[id]/approve/route.ts:105-114
**Severity**: High (Security & Trust)

**Issue**: Admin manually approves payments without blockchain verification.

**Impact**:
- Users can submit fake transaction hashes
- No verification of actual USDT transfer
- Admin must manually check TronScan - error-prone

**Recommendation**:
1. Integrate TronGrid API to verify transactions
2. Check: recipient address, amount, confirmations (>19), asset (USDT TRC20)
3. Auto-approve if valid, flag suspicious transactions

**Future Enhancement** (not blocking for Milestone 8):
```typescript
async function verifyTRC20Transaction(txHash: string, expectedAmount: number) {
  const response = await fetch(
    `https://api.trongrid.io/v1/transactions/${txHash}`,
    { headers: { "TRON-PRO-API-KEY": process.env.TRONGRID_API_KEY } }
  );

  const tx = await response.json();

  // Verify: to_address, amount, contract (USDT), confirmations
  return {
    isValid: boolean,
    amount: number,
    confirmations: number,
  };
}
```

---

### H2. Admin Authorization Weak - Email-Based Only
**File**: app/api/admin/subscriptions/route.ts:13-20
**Severity**: High (Security)

**Issue**:
```typescript
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "admin@cartelbot.coinspree.cc").split(",");

function isAdmin(email: string): boolean {
  return ADMIN_EMAILS.includes(email.toLowerCase());
}
```

**Problems**:
1. No role-based access control (RBAC)
2. Email can be spoofed if JWT signing is compromised
3. Hardcoded fallback admin email in code
4. No audit logging of admin actions

**Fix Required**:
1. Add `role` field to User model (already exists - use it!)
2. Check `user.role === "admin"` instead of email list
3. Remove hardcoded fallback email
4. Add audit log for all admin actions

**Updated Code**:
```typescript
function isAdmin(user: { role?: string }): boolean {
  return user.role === "admin";
}

// In route handler
if (!isAdmin(user)) {
  // Log unauthorized access attempt
  console.warn("Unauthorized admin access attempt:", {
    userId: user._id,
    email: user.email,
    ip: request.headers.get("x-forwarded-for"),
    timestamp: new Date(),
  });

  return NextResponse.json(...);
}
```

---

### H3. Race Condition in Subscription Approval
**File**: app/api/admin/subscriptions/[id]/approve/route.ts:105-114
**Severity**: High

**Issue**:
```typescript
if (action === "approve") {
  subscription.status = "confirmed";
  await subscription.save();  // Step 1

  await User.findByIdAndUpdate(subscription.userId, {  // Step 2
    subscriptionTier: subscription.tier,
    subscriptionExpiry: subscription.endDate,
  });
}
```

**Problem**: Two separate database writes - not atomic. If Step 2 fails:
- Subscription marked "confirmed" in database
- User still on free tier (not upgraded)
- Payment taken but no service provided

**Fix Required** - Use MongoDB transaction:
```typescript
const session = await mongoose.startSession();
session.startTransaction();

try {
  subscription.status = "confirmed";
  await subscription.save({ session });

  await User.findByIdAndUpdate(
    subscription.userId,
    {
      subscriptionTier: subscription.tier,
      subscriptionExpiry: subscription.endDate,
    },
    { session }
  );

  await session.commitTransaction();
} catch (error) {
  await session.abortTransaction();
  throw error;
} finally {
  session.endSession();
}
```

---

### H4. Missing Index on Signal.userId + createdAt
**File**: lib/subscription/usage-checker.ts:62-65
**Severity**: High (Performance)

**Query**:
```typescript
const signalsThisMonth = await Signal.countDocuments({
  userId,
  createdAt: { $gte: startOfMonth },
});
```

**Issue**: This query runs on EVERY signal submission. Without proper index, it's a full collection scan as user grows signals.

**Current Indexes** (lib/db/models/Signal.ts):
```typescript
signalSchema.index({ userId: 1, createdAt: -1 });  // EXISTS - but wrong order for range query
```

**Problem**: Index is `{userId: 1, createdAt: -1}` (descending), but range query `$gte` needs ascending order.

**Fix Required**: Change index order
```typescript
signalSchema.index({ userId: 1, createdAt: 1 });  // Ascending for $gte range queries
signalSchema.index({ userId: 1, status: 1 });     // Keep existing for status queries
```

---

### H5. Duplicate isAdmin() Function - Code Duplication
**Files**:
- app/api/admin/subscriptions/route.ts:13-20
- app/api/admin/subscriptions/[id]/approve/route.ts:13-20

**Issue**: Exact same function duplicated across 2 files.

**Impact**:
- Bug fixes require updating 2 places
- Inconsistent admin checks if code diverges
- Violates DRY principle

**Fix Required**: Extract to shared utility

**New File**: lib/auth/admin.ts
```typescript
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "").split(",").filter(Boolean);

export function isAdmin(email: string): boolean {
  if (ADMIN_EMAILS.length === 0) {
    throw new Error("ADMIN_EMAILS not configured in environment");
  }
  return ADMIN_EMAILS.includes(email.toLowerCase());
}

export async function requireAdmin(request: NextRequest) {
  const { user, error } = await getUserFromRequest(request);

  if (!user || error) {
    throw new Error("Authentication required");
  }

  if (!isAdmin(user.email)) {
    throw new Error("Admin access required");
  }

  return user;
}
```

**Updated route handlers**:
```typescript
import { requireAdmin } from "@/lib/auth/admin";

export async function GET(request: NextRequest) {
  try {
    const admin = await requireAdmin(request);
    // ... rest of code
  } catch (error) {
    return NextResponse.json({ success: false, error: { ... } }, { status: 403 });
  }
}
```

---

### H6. Active Positions Count Uses Wrong Status Filter
**File**: lib/subscription/usage-checker.ts:103-106
**Severity**: High (Logic Error)

**Issue**:
```typescript
const activeTradesCount = await Signal.countDocuments({
  userId,
  status: { $in: ["executing", "parsed"] },
});
```

**Problems**:
1. Signal status "parsed" is NOT an active position - it's a pending signal
2. Should count Trade model, not Signal model
3. Missing "failed" status cleanup

**Expected Behavior**:
- "executing" = buy order filled, OCO orders placed (ACTIVE)
- "parsed" = signal created but not executed (NOT ACTIVE)

**Fix Required**:
```typescript
// Option 1: Count from Trade model (more accurate)
import { Trade } from "@/lib/db/models/Trade";

const activeTradesCount = await Trade.countDocuments({
  userId,
  status: "open",  // Only count truly open trades
});

// Option 2: If counting from Signal, only count "executing"
const activeTradesCount = await Signal.countDocuments({
  userId,
  status: "executing",
});
```

---

## Medium Priority Issues (5)

### M1. Subscription History Unlimited - No Pagination
**File**: app/api/subscriptions/route.ts:36-38
**Severity**: Medium (Performance)

**Issue**:
```typescript
const subscriptions = await Subscription.find({ userId: String(user._id) })
  .sort({ createdAt: -1 })
  .limit(50); // Limit to last 50 subscriptions
```

**Problems**:
1. Hardcoded limit (50) - no way to fetch older records
2. No pagination support (skip/offset)
3. Frontend receives all 50 even if only showing 5

**Fix Required**:
```typescript
const page = parseInt(searchParams.get("page") || "1");
const limit = parseInt(searchParams.get("limit") || "10");
const skip = (page - 1) * limit;

const [subscriptions, total] = await Promise.all([
  Subscription.find({ userId: String(user._id) })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit),
  Subscription.countDocuments({ userId: String(user._id) }),
]);

return NextResponse.json({
  success: true,
  data: {
    subscriptions,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  },
});
```

---

### M2. Missing Email Notifications
**Files**:
- app/api/subscriptions/route.ts:169-177 (TODO comment)
- app/api/admin/subscriptions/[id]/approve/route.ts:116-122 (TODO comment)

**Issue**: Email notifications commented out - users don't know payment status.

**Impact**:
- User submits payment, no confirmation email
- Admin approves, user not notified
- Admin rejects, user doesn't know why
- Poor UX, support tickets increase

**Recommendation** (Milestone 8.1 or 9):
1. Implement using existing Resend integration
2. Email templates: payment_received, payment_approved, payment_rejected, subscription_expiring
3. Add email queue for reliability

---

### M3. No Refund/Cancellation Workflow
**File**: N/A - Feature not implemented
**Severity**: Medium (Business Logic)

**Issue**: Once payment submitted, no way to cancel or request refund.

**Impact**:
- User accidentally submits wrong tier - no recourse
- Admin rejects payment - USDT already sent, no refund process
- Chargebacks require manual intervention

**Recommendation** (Future):
1. Add "Request Refund" button for rejected subscriptions
2. Admin can issue manual refunds (record refund txHash)
3. Auto-cancel pending payments after 24 hours if not approved

---

### M4. Target Distribution Validation Missing
**File**: components/settings/SubscriptionSection.tsx (NOT IN SCOPE)
**Severity**: Medium

**Issue**: SubscriptionSection doesn't save trade settings - only shows subscription info. Trade settings saved in app/settings/page.tsx, which has validation, BUT it's not checking subscription tier limits.

**Example**: Free tier user could set maxOpenPositions to 100, bypassing the 3-position limit.

**Fix Required** (app/settings/page.tsx - line ~450):
```typescript
const handleSaveSettings = async () => {
  // Fetch current subscription tier limits
  const statusRes = await fetch("/api/subscriptions/status");
  const statusData = await statusRes.json();

  if (statusData.success) {
    const tierConfig = statusData.data.currentTier;

    // Validate against tier limits
    if (maxOpenPositions > tierConfig.features.maxOpenPositions) {
      toast.error(
        `Max open positions cannot exceed ${tierConfig.features.maxOpenPositions} for ${tierConfig.displayName} tier`
      );
      return;
    }
  }

  // ... save settings
};
```

---

### M5. No Monthly Signal Counter Reset
**File**: lib/subscription/usage-checker.ts:58-60
**Severity**: Medium (Logic Error)

**Issue**:
```typescript
const startOfMonth = new Date();
startOfMonth.setDate(1);
startOfMonth.setHours(0, 0, 0, 0);

const signalsThisMonth = await Signal.countDocuments({
  userId,
  createdAt: { $gte: startOfMonth },
});
```

**Problem**: "This month" calculation is correct, but there's no visual indicator to users when their counter resets. Free tier users with 1 signal/month don't know when they can submit again.

**Fix Required**:
1. Add reset date to usage stats response:
```typescript
return {
  tier: tierConfig,
  usage: {
    signalsThisMonth,
    signalsLimit: tierConfig.features.signalsPerMonth,
    resetDate: new Date(now.getFullYear(), now.getMonth() + 1, 1), // First day of next month
  },
};
```

2. Display in UI (SubscriptionSection.tsx):
```typescript
<div className="text-sm text-gray-500">
  {status.usage.signalsThisMonth} / {status.usage.signalsLimit}
  <span className="ml-2">
    (Resets on {new Date(status.usage.resetDate).toLocaleDateString()})
  </span>
</div>
```

---

## Low Priority Issues (3)

### L1. Console.log Debugging Statements
**Files**:
- app/api/signals/route.ts:16-20, 40-47, 69-73, 92

**Issue**: Production code contains debug console.logs

**Fix**: Remove or wrap in development check:
```typescript
if (process.env.NODE_ENV === "development") {
  console.log("POST /api/signals - Request received:", { ... });
}
```

---

### L2. Hardcoded MIN_CONFIRMATIONS
**File**: lib/subscription/constants.ts:80
**Severity**: Low

**Issue**:
```typescript
export const MIN_CONFIRMATIONS = 19;
```

**Recommendation**: Move to environment variable for flexibility:
```typescript
export const MIN_CONFIRMATIONS = parseInt(
  process.env.TRON_MIN_CONFIRMATIONS || "19"
);
```

---

### L3. No Subscription Analytics/Metrics
**File**: N/A
**Severity**: Low

**Issue**: No tracking of key business metrics:
- Total revenue per month
- Conversion rate (free → premium)
- Churn rate
- Average subscription lifetime

**Recommendation** (Future - Milestone 9 or 10):
Create admin analytics dashboard showing:
- MRR (Monthly Recurring Revenue)
- Active subscriptions by tier
- Pending payment approval count
- Rejection reasons analysis

---

## Security Assessment

**Overall Security Score**: 7.5/10

### Strengths:
1. ✅ Authentication required on all endpoints
2. ✅ Admin authorization implemented
3. ✅ Input validation (txHash, TRC20 address)
4. ✅ Duplicate transaction prevention
5. ✅ Encrypted API keys (existing system)

### Weaknesses:
1. ❌ No blockchain payment verification (H1)
2. ❌ Weak admin auth (email-only) (H2)
3. ❌ Hardcoded wallet address placeholder (C2)
4. ❌ No audit logging of admin actions
5. ❌ No rate limiting on subscription endpoints

### Recommendations:
1. Implement TronGrid API verification before Milestone 8 production
2. Add rate limiting (max 5 submissions per hour per user)
3. Log all admin approve/reject actions to audit trail
4. Add IP allowlist for admin endpoints (optional)

---

## Performance Assessment

**Overall Performance Score**: 8.0/10

### Strengths:
1. ✅ Proper MongoDB indexes on Subscription model
2. ✅ Pagination limit (50) on subscription history
3. ✅ Efficient queries (no unnecessary joins)
4. ✅ Parallel fetches in frontend (Promise.all)

### Weaknesses:
1. ⚠️ Signal createdAt index wrong order (H4)
2. ⚠️ No caching of tier configs (fetched on every call)
3. ⚠️ Active positions query could use Trade model instead (H6)

### Recommendations:
1. Fix Signal index: `{ userId: 1, createdAt: 1 }` (ascending)
2. Cache TIER_CONFIGS in memory (it's static data)
3. Add Redis caching for subscription status (reduce DB hits)

---

## Type Safety Assessment

**Overall Type Safety Score**: 6.5/10

### Strengths:
1. ✅ All API responses have explicit types
2. ✅ Zod validation for environment variables (constants.ts should add)
3. ✅ TypeScript interfaces for all data structures
4. ✅ Proper error type handling

### Weaknesses:
1. ❌ TypeScript compilation errors (C1) - **BLOCKING**
2. ⚠️ Some `any` types in error handlers
3. ⚠️ Missing return type annotations on some functions

### Fix Required:
1. Fix model deletion pattern (C1)
2. Add explicit return types to all exported functions
3. Replace `any` with proper error types

---

## Code Quality Assessment

**Overall Code Quality Score**: 7.8/10

### Strengths:
1. ✅ Clean, readable code structure
2. ✅ Consistent naming conventions
3. ✅ Good separation of concerns (constants, checker, middleware)
4. ✅ Comprehensive error handling
5. ✅ JSDoc comments on exported functions

### Weaknesses:
1. ❌ Code duplication (isAdmin function) (H5)
2. ⚠️ TODO comments left in production code
3. ⚠️ Magic numbers (50, 64, etc.) not extracted to constants
4. ⚠️ No unit tests for subscription logic

### Recommendations:
1. Extract duplicated isAdmin to lib/auth/admin.ts (H5)
2. Remove or implement TODO comments before production
3. Extract magic numbers to named constants
4. Add unit tests for usage-checker.ts functions

---

## Integration Testing Recommendations

**Critical Test Cases**:

### Subscription Flow Tests:
1. ✅ Free user submits payment (premium tier)
2. ✅ Admin approves payment → user upgraded
3. ✅ Admin rejects payment → user stays free
4. ✅ Duplicate txHash rejected
5. ✅ Invalid txHash format rejected
6. ✅ Subscription expires → user downgraded

### Usage Limit Tests:
1. ✅ Free user hits 1 signal/month limit → blocked
2. ✅ Premium user submits 20 signals → allowed
3. ✅ Pro user submits unlimited signals → allowed
4. ✅ Counter resets on first day of month
5. ✅ Expired subscription blocks signal submission

### Admin Tests:
1. ✅ Non-admin cannot access admin endpoints
2. ✅ Admin can view pending subscriptions
3. ✅ Admin can filter by status
4. ✅ Concurrent approval requests handled correctly

---

## Blocking Issues for Production

**MUST FIX before production deployment**:

1. **[C1] TypeScript Compilation Errors** - Build broken
2. **[C2] Hardcoded Wallet Address** - Invalid payment address
3. **[C3] Transaction Hash Validation** - Could accept invalid TRC20 hashes
4. **[C4] No Expiry Cleanup Job** - Users keep premium access after expiry

**SHOULD FIX before production**:

1. **[H2] Weak Admin Authorization** - Security risk
2. **[H3] Race Condition in Approval** - Data integrity risk
3. **[H4] Missing Index** - Performance degrades with scale
4. **[H6] Active Positions Logic** - Wrong tier limit enforcement

---

## Summary

### What Works Well:
- Clean architecture with proper separation of concerns
- Comprehensive input validation
- Good error handling and user feedback
- Beautiful UI with clear subscription flow
- Proper MongoDB schema design

### What Needs Immediate Attention:
- Fix TypeScript compilation errors (blocking build)
- Replace hardcoded wallet address with env variable
- Fix transaction hash validation inconsistency
- Implement subscription expiry cleanup job
- Add blockchain payment verification (TronGrid API)

### Overall Recommendation:
**Code is 85% production-ready** with critical fixes required. After addressing the 4 critical issues and 6 high-priority issues, the subscription system will be robust, secure, and scalable.

**Estimated Fix Time**: 4-6 hours for all critical + high priority issues

**Next Steps**:
1. Fix TypeScript errors (30 min)
2. Move wallet address to env (15 min)
3. Fix txHash validation (10 min)
4. Implement expiry cleanup job (1 hour)
5. Extract isAdmin to shared utility (20 min)
6. Fix race condition with transactions (45 min)
7. Fix Signal index order (5 min)
8. Fix active positions query (15 min)
9. Add TronGrid verification (2 hours)
10. Add audit logging (30 min)

---

## Files Requiring Changes

### Immediate Fixes (Critical):
- [ ] lib/db/models/Subscription.ts (C1, C3)
- [ ] lib/db/models/User.ts (C1)
- [ ] lib/db/models/Signal.ts (C1, H4)
- [ ] lib/db/models/Trade.ts (C1)
- [ ] lib/db/models/OrphanedCoin.ts (C1)
- [ ] lib/db/models/WebSocketSession.ts (C1)
- [ ] lib/subscription/constants.ts (C2, L2)
- [ ] lib/config/env.ts (C2 - add validation)
- [ ] lib/subscription/expiry-checker.ts (C4 - NEW FILE)

### High Priority Fixes:
- [ ] lib/auth/admin.ts (H5 - NEW FILE)
- [ ] lib/subscription/trongrid-verifier.ts (H1 - NEW FILE)
- [ ] app/api/admin/subscriptions/route.ts (H2, H5)
- [ ] app/api/admin/subscriptions/[id]/approve/route.ts (H2, H3, H5)
- [ ] lib/subscription/usage-checker.ts (H6)

### Medium/Low Priority:
- [ ] app/api/subscriptions/route.ts (M1, M2, L1)
- [ ] app/settings/page.tsx (M4)
- [ ] components/settings/SubscriptionSection.tsx (M5)

---

**Review Completed**: November 15, 2025
**Total Review Time**: 45 minutes
**Confidence Level**: High (all files analyzed, patterns verified)
