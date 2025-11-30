# CartelBot E2E Tests

Comprehensive end-to-end tests for all critical user flows in the CartelBot trading bot application.

## 📁 Test Structure

```
e2e/
├── auth/                    # Authentication flow tests
│   └── magic-link.spec.ts   # Magic link authentication
├── signals/                 # Signal submission tests
│   └── signal-submission.spec.ts
├── trades/                  # Trade execution tests
│   └── trade-execution.spec.ts
├── portfolio/               # Portfolio monitoring tests
│   └── portfolio-monitoring.spec.ts
├── admin/                   # Admin panel tests
│   └── admin-panel.spec.ts
├── fixtures/                # Test data and fixtures
│   └── test-data.ts
└── helpers/                 # Test helper functions
    ├── auth-helpers.ts
    └── database-helpers.ts
```

## 🚀 Running Tests

### Run All Tests
```bash
npm run test:e2e
```

### Run Specific Test Suite
```bash
npx playwright test e2e/admin/admin-panel.spec.ts
npx playwright test e2e/auth/magic-link.spec.ts
```

### Run with UI Mode
```bash
npx playwright test --ui
```

### Run in Headed Mode (see browser)
```bash
npx playwright test --headed
```

### Run Specific Browser
```bash
npx playwright test --project=chromium
npx playwright test --project=firefox
npx playwright test --project=webkit
```

## ⚙️ Configuration

### Environment Variables

Create a `.env.test` file with:

```env
# Database (use test database!)
DATABASE_URL=mongodb+srv://user:pass@cluster.mongodb.net/cartelbot_test

# Application
NEXT_PUBLIC_API_URL=http://localhost:3000

# Binance Testnet
BINANCE_TESTNET_URL=https://testnet.binance.vision
BINANCE_TESTNET_WS=wss://stream.testnet.binance.vision:9443

# Test Binance API Keys (Testnet)
TEST_BINANCE_API_KEY=your_testnet_api_key
TEST_BINANCE_API_SECRET=your_testnet_api_secret

# Admin Credentials
ADMIN_USERNAME=admin
TEST_ADMIN_PASSWORD=aDmin@7878

# Email (for magic link testing)
RESEND_API_KEY=re_test_key_or_mock
```

### Playwright Configuration

Tests use the configuration from `playwright.config.ts`:

- **Base URL**: `http://localhost:3000`
- **Browsers**: Chrome, Firefox, Safari (desktop + mobile)
- **Auto-start dev server**: Yes
- **Screenshots**: On failure only
- **Videos**: Retained on failure
- **Timeout**: 30 seconds per test

## 📝 Test Coverage

### 1. Authentication Flow ✅
- Magic link email sending
- Token verification
- Session creation
- Logout functionality
- Protected route access

### 2. Signal Submission ⚠️
- Text signal parsing (3 formats)
- Image signal OCR
- Signal validation
- Auto-execution
- Error handling

**Note**: Most signal tests are skipped pending authentication implementation

### 3. Trade Execution ⚠️
- Position sizing (fixed, percentage, risk-based)
- Trade approval workflow
- OCO order creation
- Status synchronization

**Note**: Requires authenticated session + test signals

### 4. Portfolio Monitoring ⚠️
- Real-time balance display
- WebSocket connection
- Live status indicator
- Manual refresh
- Session expiry handling

**Note**: Requires authenticated session + Binance API keys

### 5. Admin Panel ✅
- Admin login/logout
- Dashboard statistics
- Subscription breakdown
- Signal status monitoring
- Database cleanup operations
- Navigation between sections

## 🧪 Test Data

### Test Users

```typescript
// Regular user
email: 'test@example.com'
apiKey: process.env.TEST_BINANCE_API_KEY
useTestnet: true

// Premium user
email: 'premium@example.com'
subscription: 'premium'

// Admin
username: 'admin'
password: 'aDmin@7878'
```

### Test Signals

```typescript
// Percentage-based
Buying $BTC
First buying: 50000 – 51000
Targets: 4%, 8%, 12%, 20%
Sl: 48000

// Price-based
$ETH Buying Now:
Entry: 3000 - 2900
Targets: 3100, 3200, 3400, 3600
SL: 2800
```

## 🔧 Helper Functions

### Authentication Helpers

```typescript
import { loginAsUser, loginAsAdmin, logout } from './helpers/auth-helpers';

// Login as regular user
await loginAsUser(page, 'test@example.com');

// Login as admin
await loginAsAdmin(page);

// Logout
await logout(page);
```

### Database Helpers

```typescript
import {
  cleanupTestUser,
  createTestSignal,
  getMagicLinkToken
} from './helpers/database-helpers';

// Clean up test data
await cleanupTestUser('test@example.com');

// Create test signal
const signalId = await createTestSignal(userId, signalData);

// Get magic link token
const token = await getMagicLinkToken('test@example.com');
```

## 🐛 Debugging Tests

### View Test Reports
```bash
npx playwright show-report
```

### Debug Specific Test
```bash
npx playwright test e2e/admin/admin-panel.spec.ts --debug
```

### Trace Viewer
```bash
npx playwright test --trace on
npx playwright show-trace trace.zip
```

## ✅ Test Status

| Test Suite | Status | Tests | Passing | Skipped |
|------------|--------|-------|---------|---------|
| Admin Panel | ✅ Ready | 15 | 15 | 0 |
| Magic Link Auth | ⚠️ Partial | 12 | 5 | 7 |
| Signal Submission | ⚠️ Pending Auth | 5 | 0 | 5 |
| Trade Execution | ⚠️ Pending Auth | 4 | 0 | 4 |
| Portfolio | ⚠️ Pending Auth | 5 | 0 | 5 |

**Total**: 41 tests (20 ready, 21 pending authentication implementation)

## 📋 Prerequisites

1. **Development server running**: `npm run dev`
2. **MongoDB connection**: Test database accessible
3. **Binance Testnet keys**: For trade execution tests
4. **Email service**: For magic link tests (Resend or mock)

## 🔐 Security Notes

- **Never commit `.env.test`** with real credentials
- Use **Testnet only** for trade execution tests
- **Clean up test data** after each test run
- **Separate test database** from production

## 📚 Resources

- [Playwright Documentation](https://playwright.dev)
- [Binance Testnet](https://testnet.binance.vision)
- [CartelBot Documentation](https://docs.cartelbot.coinspree.cc)

## 🤝 Contributing

When adding new E2E tests:

1. Place in appropriate directory (`auth/`, `signals/`, etc.)
2. Use existing helpers from `helpers/`
3. Follow naming convention: `feature-name.spec.ts`
4. Add test data to `fixtures/test-data.ts`
5. Document any new environment variables
6. Clean up test data in `afterEach` hooks
7. Update this README with test coverage

## 📞 Support

For issues with E2E tests:
- Check test output: `npx playwright show-report`
- Review traces: `npx playwright show-trace`
- Check environment variables in `.env.test`
- Verify dev server is running
- Ensure database connection is valid

---

**Last Updated**: November 30, 2025
**Test Framework**: Playwright 1.40+
**Node Version**: 20 LTS
**TypeScript**: 5.3+
