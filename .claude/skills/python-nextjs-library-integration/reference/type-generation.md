# TypeScript Type Generation from Python

Guide for generating TypeScript types from Python Pydantic models.

## Manual Type Mapping

### Python → TypeScript Type Map

| Python Type | TypeScript Type | Notes |
|------------|-----------------|-------|
| `str` | `string` | - |
| `int` | `number` | - |
| `float` | `number` | - |
| `bool` | `boolean` | - |
| `None` | `null` | - |
| `Optional[T]` | `T \| null` or `T \| undefined` | - |
| `list[T]` | `T[]` or `Array<T>` | - |
| `dict[K, V]` | `Record<K, V>` | - |
| `Literal['a', 'b']` | `'a' \| 'b'` | String union |
| `datetime` | `string` (ISO 8601) or `Date` | Serialize as ISO |
| `Decimal` | `number` or `string` | Depends on precision needs |

## Example: Pydantic to TypeScript

**Python Model**:
```python
from pydantic import BaseModel, Field
from typing import Optional, Literal
from datetime import datetime

class TradeSignal(BaseModel):
    symbol: str = Field(..., pattern=r'^[A-Z]+USDT$')
    action: Literal['BUY', 'SELL']
    entry_price: float = Field(..., gt=0)
    targets: list[float]
    stop_loss: Optional[float] = None
    created_at: datetime

    class Config:
        json_schema_extra = {
            "example": {
                "symbol": "BTCUSDT",
                "action": "BUY",
                "entry_price": 50000.0,
                "targets": [51000, 52000],
                "stop_loss": 49000,
                "created_at": "2025-12-10T14:30:00Z"
            }
        }
```

**TypeScript Interface**:
```typescript
export interface TradeSignal {
  symbol: string; // Matches pattern ^[A-Z]+USDT$
  action: 'BUY' | 'SELL';
  entry_price: number; // > 0
  targets: number[];
  stop_loss?: number | null;
  created_at: string; // ISO 8601 datetime
}
```

**TypeScript Zod Schema** (with validation):
```typescript
import { z } from 'zod';

export const TradeSignalSchema = z.object({
  symbol: z.string().regex(/^[A-Z]+USDT$/),
  action: z.enum(['BUY', 'SELL']),
  entry_price: z.number().positive(),
  targets: z.array(z.number()),
  stop_loss: z.number().nullable().optional(),
  created_at: z.string().datetime(),
});

export type TradeSignal = z.infer<typeof TradeSignalSchema>;

// Runtime validation
export function validateTradeSignal(data: unknown): TradeSignal {
  return TradeSignalSchema.parse(data);
}
```

## Automated Type Generation Script

See: `scripts/generate-types.py`

**Usage**:
```bash
python scripts/generate-types.py models.py > types/python-generated.ts
```
