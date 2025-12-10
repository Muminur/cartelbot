# Python ↔ Next.js Compatibility Matrix

This document tracks known version compatibility, common issues, and recommended configurations.

## Version Compatibility

### Python Versions

| Python Version | FastAPI | Pydantic | discord.py-self | Recommended |
|---------------|---------|----------|-----------------|-------------|
| 3.8           | ✅      | ✅       | ✅              | ⚠️ EOL 2024 |
| 3.9           | ✅      | ✅       | ✅              | ✅ Stable   |
| 3.10          | ✅      | ✅       | ✅              | ✅ Stable   |
| 3.11          | ✅      | ✅       | ✅              | ✅ **Recommended** |
| 3.12          | ✅      | ⚠️ v2.5+ | ⚠️ Limited     | ⚠️ Experimental |

**Recommendation**: Python 3.11 for production (best performance + compatibility)

---

### Next.js Versions

| Next.js Version | Node.js | React | TypeScript | CartelBot Status |
|----------------|---------|-------|------------|------------------|
| 13.4+          | 18.17+  | 18    | 5.0+       | ✅ Supported     |
| 14.0+          | 18.17+  | 18    | 5.0+       | ✅ Supported     |
| 15.0+          | 18.18+  | 19    | 5.3+       | ✅ Beta          |
| 16.0+ (Turbopack) | 18.18+ | 19 | 5.6+       | ✅ **Current**   |

**Recommendation**: Next.js 16+ with React 19 (CartelBot uses this)

---

### Library Compatibility

| Library | Python Version | FastAPI Version | Notes |
|---------|---------------|-----------------|-------|
| **FastAPI** | 3.8+ | Latest: 0.104.1 | Use `uvicorn[standard]` for best performance |
| **Pydantic** | 3.8+ | v2.5+ required | v2.0 breaking changes from v1.x |
| **Motor** (MongoDB) | 3.7+ | 3.3.2+ | Async driver for MongoDB |
| **aiohttp** | 3.8+ | 3.9.1+ | Async HTTP client |
| **discord.py-self** | 3.8+ | 2.1.0+ | ⚠️ Violates Discord ToS |
| **cryptography** | 3.7+ | 41.0+ | AES-256-GCM encryption |
| **redis-py** | 3.7+ | 5.0.1+ | Use `redis.asyncio` for async |

---

## Known Issues & Solutions

### Issue 1: Pydantic v1 vs v2 Breaking Changes

**Problem**: Pydantic v2 changed many APIs, causing errors with v1 code.

**Symptoms**:
```python
# v1 (old)
class Model(BaseModel):
    class Config:
        orm_mode = True

# v2 (new) - different syntax
class Model(BaseModel):
    model_config = ConfigDict(from_attributes=True)
```

**Solution**: Use Pydantic v2 with compatibility imports
```python
from pydantic import BaseModel, ConfigDict, Field

class Model(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    name: str = Field(..., description="Name field")
```

**Migration guide**: https://docs.pydantic.dev/latest/migration/

---

### Issue 2: Next.js 16 Turbopack Module Resolution

**Problem**: Turbopack resolves `__dirname` incorrectly, breaking Python service paths.

**Symptom**:
```
Error: Cannot find module at J:\ROOT\...
```

**Solution**: Use `process.cwd()` instead of `__dirname`
```typescript
// ✗ Bad
const scriptPath = path.join(__dirname, 'scripts', 'parse.py');

// ✓ Good
const scriptPath = path.resolve(process.cwd(), 'scripts', 'parse.py');
```

**CartelBot example**: Fixed in Tesseract.js integration (Milestone 3)

---

### Issue 3: Windows curl_cffi Compatibility

**Problem**: `curl_cffi` library crashes on Windows with ctype errors.

**Symptom**:
```
TypeError: initializer for ctype 'void *' must be a cdata pointer
```

**Solution**: Use `tls_client` (Go-based) instead
```python
# ✗ Bad
import curl_cffi

# ✓ Good
import tls_client

session = tls_client.Session(client_identifier="chrome_124")
response = session.get("https://discord.com/api/users/@me")
```

**CartelBot fix**: Commit 3381042 (Discord token validation)

---

### Issue 4: Date Serialization Mismatch

**Problem**: Python `datetime` doesn't serialize to JSON automatically.

**Symptom**:
```python
return {"timestamp": datetime.now()}
# TypeError: Object of type datetime is not JSON serializable
```

**Solution**: Convert to ISO 8601 string
```python
from datetime import datetime

def serialize_datetime(dt: datetime) -> str:
    return dt.isoformat()

# In response
return {"timestamp": datetime.now().isoformat()}
```

**TypeScript parsing**:
```typescript
const data = await response.json();
const timestamp = new Date(data.timestamp); // Parse ISO string
```

---

### Issue 5: MongoDB ObjectId Serialization

**Problem**: MongoDB `ObjectId` objects appear as `[object Object]` in URLs.

**Symptom**:
```typescript
const url = `/api/signals/${signal._id}`;
// Result: /api/signals/[object Object]
```

**Solution**: Convert to string explicitly
```typescript
const url = `/api/signals/${String(signal._id)}`;
// OR in API response
return JSON.parse(JSON.stringify(data)); // Serializes ObjectId
```

**CartelBot fix**: Commit 20310ac (serialize.ts utility)

---

### Issue 6: Python asyncio Event Loop Errors

**Problem**: Running async code in sync context causes errors.

**Symptom**:
```
RuntimeError: This event loop is already running
```

**Solution**: Use `asyncio.run()` or create new loop
```python
import asyncio

# ✗ Bad
async def main():
    result = await fetch_data()

main()  # Error: no event loop

# ✓ Good
async def main():
    result = await fetch_data()

asyncio.run(main())  # Creates event loop
```

---

### Issue 7: CORS Errors in Development

**Problem**: Next.js dev server blocks Python service requests.

**Symptom**:
```
Access to fetch at 'http://localhost:8000' has been blocked by CORS policy
```

**Solution**: Configure CORS in Python service
```python
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # Next.js dev server
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

---

### Issue 8: Environment Variable Not Loaded

**Problem**: Python service can't read `.env` file.

**Symptom**:
```python
os.getenv("DATABASE_URL")  # Returns None
```

**Solution**: Install and use `python-dotenv`
```python
from dotenv import load_dotenv
import os

load_dotenv()  # Load .env file

DATABASE_URL = os.getenv("DATABASE_URL")
```

---

## Recommended Configurations

### Development Environment

**Python** (requirements-dev.txt):
```
fastapi==0.104.1
uvicorn[standard]==0.24.0
pydantic==2.5.0
python-dotenv==1.0.0
pytest==7.4.3
pytest-asyncio==0.21.1
black==23.12.0  # Code formatter
ruff==0.1.9     # Linter
```

**Next.js** (package.json):
```json
{
  "dependencies": {
    "next": "^16.0.0",
    "react": "^19.0.0",
    "typescript": "^5.6.0",
    "zod": "^3.22.4"
  },
  "devDependencies": {
    "@types/node": "^20.10.0",
    "eslint": "^8.56.0",
    "vitest": "^1.0.4"
  }
}
```

---

### Production Environment

**Python** (requirements.txt):
```
# Core
fastapi==0.104.1
uvicorn[standard]==0.24.0
pydantic==2.5.0
pydantic-settings==2.1.0

# Database
motor==3.3.2
redis==5.0.1

# HTTP
aiohttp==3.9.1
httpx==0.25.2

# Security
cryptography==41.0.7
pyjwt==2.8.0

# Discord (if needed)
discord.py-self==2.1.0
tls-client==1.0.1

# Monitoring
sentry-sdk==1.39.1
```

**Docker** (Python service):
```dockerfile
FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

---

## Testing Configurations

### Python (pytest.ini)

```ini
[pytest]
asyncio_mode = auto
testpaths = tests
python_files = test_*.py
python_classes = Test*
python_functions = test_*
```

### Next.js (vitest.config.ts)

```typescript
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: './test/setup.ts',
  },
});
```

---

## Performance Benchmarks

### HTTP Request Latency

| Configuration | Avg Latency | Notes |
|--------------|-------------|-------|
| FastAPI (local) | 2-5ms | No network overhead |
| FastAPI (Docker) | 5-10ms | Container overhead |
| FastAPI (production) | 20-50ms | Network latency |
| With connection pooling | -30% | Reuse TCP connections |
| With Redis cache | -80% | Cached responses |

### Serialization Performance

| Format | 1KB payload | 100KB payload | Notes |
|--------|-------------|---------------|-------|
| JSON | 0.1ms | 5ms | Human-readable |
| msgpack | 0.05ms | 2ms | 2-3x smaller |
| Protocol Buffers | 0.03ms | 1ms | Schema required |

---

## Troubleshooting Checklist

### Python Service Not Responding

1. ✅ Check service is running: `curl http://localhost:8000/health`
2. ✅ Verify port is correct: `netstat -an | grep 8000`
3. ✅ Check logs: `tail -f logs/python-service.log`
4. ✅ Test with curl: `curl -X POST http://localhost:8000/api/test`
5. ✅ Verify environment variables: `echo $PYTHON_SERVICE_URL`

### Type Validation Errors

1. ✅ Check Pydantic model matches TypeScript type
2. ✅ Verify required fields are present
3. ✅ Check data types (string vs number)
4. ✅ Validate enum values match
5. ✅ Test with sample data: `pytest tests/test_validation.py -v`

### CORS Issues

1. ✅ Verify `allow_origins` includes Next.js URL
2. ✅ Check `allow_credentials` is `True`
3. ✅ Ensure preflight requests succeed (OPTIONS method)
4. ✅ Verify headers match (Content-Type, Authorization)
5. ✅ Test in browser DevTools Network tab

---

## Version Update Strategy

### Python Library Updates

```bash
# Check outdated packages
pip list --outdated

# Update specific package
pip install --upgrade fastapi

# Update all (⚠️ test thoroughly)
pip install --upgrade -r requirements.txt

# Lock versions
pip freeze > requirements-lock.txt
```

### Next.js Updates

```bash
# Check outdated packages
npm outdated

# Update Next.js (major version)
npm install next@latest react@latest react-dom@latest

# Update all minor/patch versions
npm update

# Lock versions
npm ci  # Uses package-lock.json
```

### Breaking Change Migration

1. **Read release notes** for breaking changes
2. **Update in dev environment** first
3. **Run full test suite**: `pytest && npm test`
4. **Manual testing** of critical paths
5. **Deploy to staging** before production
6. **Monitor logs** after deployment

---

## Security Considerations

### Dependency Vulnerabilities

```bash
# Python security scan
pip install safety
safety check

# Node.js security scan
npm audit

# Fix auto-fixable issues
npm audit fix
```

### Pinning Versions

**Python** (requirements.txt):
```
# ✗ Unpinned (security risk)
fastapi

# ✓ Pinned
fastapi==0.104.1
```

**Node.js** (package.json):
```json
{
  "dependencies": {
    "next": "16.0.0"  // ✓ Exact version
  }
}
```

---

## Resources

- **FastAPI Docs**: https://fastapi.tiangolo.com
- **Pydantic Docs**: https://docs.pydantic.dev
- **Next.js Docs**: https://nextjs.org/docs
- **Python Async Guide**: https://docs.python.org/3/library/asyncio.html
- **TypeScript Handbook**: https://www.typescriptlang.org/docs/
