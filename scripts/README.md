# CartelBot Development Scripts

Utility scripts for development, testing, and debugging.

## Available Scripts

### 1. populate-test-data.js

**Purpose:** Populate MongoDB with realistic test data for development

**Usage:**
```bash
node scripts/populate-test-data.js
```

**What it creates:**
- 1 test user: `test@cartelbot.coinspree.cc`
- 1 active premium subscription (30 days)
- 3 signals (executing, pending, completed)
- 4 trades (2 open, 2 closed with P&L)

**Features:**
- Interactive prompt before clearing existing data
- Encrypted API keys using AES-256-GCM
- Realistic timestamps (hours/days ago)
- Calculates P&L and win rates

**Output Example:**
```
📈 Test Data Summary:
==========================================
👤 User: test@cartelbot.coinspree.cc
📊 Signals: 3 (1 executing, 1 pending, 1 completed)
💰 Trades: 4 (2 open, 2 closed)
💵 Total P&L: +$100.00 (1 win, 1 loss)
📈 Win Rate: 50%
==========================================
```

---

### 2. generate-test-session.js

**Purpose:** Generate valid JWT session tokens for testing without authentication flow

**Usage:**
```bash
node scripts/generate-test-session.js
```

**Prerequisites:**
- Test user must exist (run `populate-test-data.js` first)

**Output:**
- 7-day valid session token for test user
- Instructions for setting cookie in browser
- Example curl command for API testing

**How to use the token:**

**Option A - Browser Testing:**
1. Open DevTools (F12) in your browser
2. Go to Application → Cookies → http://localhost:3001
3. Add new cookie:
   - Name: `session`
   - Value: `<paste token here>`
   - Path: `/`
   - HttpOnly: `true`
   - Secure: `false`
4. Refresh page - you're logged in!

**Option B - API Testing:**
```bash
curl -H "Cookie: session=YOUR_TOKEN_HERE" http://localhost:3001/api/stats
```

---

## Common Workflows

### Fresh Start (Empty Database)

```bash
# 1. Populate test data
node scripts/populate-test-data.js

# 2. Generate session token
node scripts/generate-test-session.js

# 3. Copy token and set cookie in browser
# 4. Visit http://localhost:3001/dashboard
```

### Re-populate Test Data

```bash
# Will prompt to clear existing data
node scripts/populate-test-data.js
# Answer: yes
```

### Test API Endpoints

```bash
# Get session token
node scripts/generate-test-session.js

# Save token as variable (PowerShell)
$TOKEN = "your_token_here"

# Test endpoints
curl -H "Cookie: session=$TOKEN" http://localhost:3001/api/stats
curl -H "Cookie: session=$TOKEN" http://localhost:3001/api/signals?status=pending,executing
curl -H "Cookie: session=$TOKEN" http://localhost:3001/api/trades?status=open
```

---

## Requirements

Both scripts require:
- Node.js 18+
- MongoDB connection (configured in `.env.local`)
- Dependencies: `mongoose`, `jsonwebtoken`, `crypto` (Node.js built-in)

## Environment Variables

Scripts read from `.env.local`:
- `DATABASE_URL` - MongoDB connection string
- `ENCRYPTION_KEY` - For encrypting API keys (populate-test-data.js)
- `JWT_SECRET` - For generating session tokens (generate-test-session.js)

## Troubleshooting

**Error: Test user not found**
- Run `populate-test-data.js` first to create the test user

**Error: DATABASE_URL not found**
- Check `.env.local` file exists in project root
- Verify `DATABASE_URL` is set correctly

**Error: Cannot connect to MongoDB**
- Verify MongoDB is running and accessible
- Check connection string format and credentials

**Session token not working**
- Ensure token is set as HttpOnly cookie
- Check token hasn't expired (7 day lifetime)
- Verify JWT_SECRET matches between generation and verification
- Clear browser cookies and regenerate token

---

## Notes

- These scripts are for **development only**
- Test data uses dummy/encrypted API keys
- Session tokens expire after 7 days
- Scripts will not modify production databases (only `cartelbot` database)
