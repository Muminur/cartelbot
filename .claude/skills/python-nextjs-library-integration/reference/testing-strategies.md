# Testing Strategies for Python-Next.js Integration

## Unit Testing (Python)

```python
import pytest
from httpx import AsyncClient
from main import app

@pytest.mark.asyncio
async def test_parse_signal():
    async with AsyncClient(app=app, base_url="http://test") as client:
        response = await client.post("/api/signals/parse", json={
            "symbol": "BTCUSDT",
            "entry_price": 50000
        })

        assert response.status_code == 200
        data = response.json()
        assert data["symbol"] == "BTCUSDT"
```

## Integration Testing (Next.js)

```typescript
import { describe, it, expect } from 'vitest';
import { pythonClient } from '@/lib/python-services/client';

describe('Python Integration', () => {
  it('should parse signal', async () => {
    const result = await pythonClient.parseSignal({
      symbol: 'BTCUSDT',
      entry_price: 50000,
    });

    expect(result.symbol).toBe('BTCUSDT');
  });
});
```

## End-to-End Testing (Playwright)

```typescript
import { test, expect } from '@playwright/test';

test('signal workflow', async ({ page }) => {
  await page.goto('/signals/new');
  await page.fill('[name="symbol"]', 'BTCUSDT');
  await page.click('button[type="submit"]');
  await expect(page.locator('.success')).toBeVisible();
});
```
