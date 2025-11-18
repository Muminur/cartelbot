# OCO Orders System Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         OCO ORDERS SYSTEM                                │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                         USER INTERFACE LAYER                             │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌─────────────────────────────────┐  ┌─────────────────────────────┐  │
│  │      /oco (List Page)           │  │  /oco/[orderListId]         │  │
│  │  ─────────────────────────      │  │  (Detail Page)              │  │
│  │  • All OCO orders table         │  │  ──────────────             │  │
│  │  • Mainnet prices (live)        │  │  • Order overview card      │  │
│  │  • Testnet prices (live)        │  │  • Take Profit card         │  │
│  │  • Symbol filter                │  │  • Stop Loss card           │  │
│  │  • Status filter                │  │  • Progress bars            │  │
│  │  • Network filter               │  │  • Cancel button            │  │
│  │  • Auto-refresh (10s)           │  │  • Auto-refresh (10s)       │  │
│  │  • View Details button ─────────┼──┼─► Navigate to detail        │  │
│  └─────────────────────────────────┘  └─────────────────────────────┘  │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │              Sidebar Navigation (ListOrdered icon)                  │ │
│  │  Dashboard | Portfolio | Signals | Trades | OCO Orders | ...      │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
                                     │
                                     │ HTTP Requests
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           API LAYER                                      │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  GET /api/oco                                                    │   │
│  │  ─────────────                                                   │   │
│  │  • Authenticate user (getUserFromRequest)                        │   │
│  │  • Query Trade model for OCO orders                              │   │
│  │  • Filter by symbol/status/network                               │   │
│  │  • Paginate results (20 per page)                                │   │
│  │  • Group orders by orderListId                                   │   │
│  │  • Compute OCO status (FILLED/CANCELED/etc)                      │   │
│  │  • Return JSON response                                          │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  GET /api/trades/oco-status/[orderListId]                        │   │
│  │  ──────────────────────────────────────────                      │   │
│  │  • Verify user owns this OCO order                               │   │
│  │  • Decrypt Binance API keys                                      │   │
│  │  • Fetch live status from Binance API                            │   │
│  │  • Return real-time order data                                   │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  GET /api/binance/ticker?symbol=X&testnet=true/false             │   │
│  │  ────────────────────────────────────────────────                │   │
│  │  • Fetch current price from Binance                              │   │
│  │  • Support mainnet AND testnet                                   │   │
│  │  • Return price + 24hr change %                                  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  POST /api/trades/close/[id]                                     │   │
│  │  ────────────────────────                                        │   │
│  │  • Cancel OCO orders via Binance API                             │   │
│  │  • Update Trade status to 'cancelled'                            │   │
│  │  • Return success/error response                                 │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
                                     │
                                     │ Database Queries
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         DATABASE LAYER                                   │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  MongoDB (Trade Collection)                                      │   │
│  │  ──────────────────────────                                      │   │
│  │                                                                   │   │
│  │  Trade Document:                                                 │   │
│  │  {                                                                │   │
│  │    _id: ObjectId,                                                │   │
│  │    userId: String,                                               │   │
│  │    symbol: "BTCUSDT",                                            │   │
│  │    testnet: Boolean,                                             │   │
│  │    sellOrders: [                                                 │   │
│  │      {                                                            │   │
│  │        orderId: 12345,                                           │   │
│  │        orderListId: 67890,  ◄─── Groups OCO orders               │   │
│  │        type: "LIMIT_MAKER",                                      │   │
│  │        price: 50000,                                             │   │
│  │        quantity: 0.001,                                          │   │
│  │        status: "NEW"                                             │   │
│  │      },                                                           │   │
│  │      {                                                            │   │
│  │        orderId: 12346,                                           │   │
│  │        orderListId: 67890,  ◄─── Same orderListId (OCO pair)     │   │
│  │        type: "STOP_LOSS_LIMIT",                                  │   │
│  │        price: 45000,                                             │   │
│  │        stopPrice: 45500,                                         │   │
│  │        quantity: 0.001,                                          │   │
│  │        status: "NEW"                                             │   │
│  │      }                                                            │   │
│  │    ]                                                              │   │
│  │  }                                                                │   │
│  │                                                                   │   │
│  │  Indexes:                                                         │   │
│  │  • { userId: 1, createdAt: -1 }                                  │   │
│  │  • { "sellOrders.orderListId": 1 }                               │   │
│  │  • { userId: 1, status: 1 }                                      │   │
│  │                                                                   │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
                                     │
                                     │ API Requests
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      BINANCE API LAYER                                   │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌─────────────────────────┐  ┌─────────────────────────┐              │
│  │  Mainnet Binance API    │  │  Testnet Binance API    │              │
│  │  ────────────────────   │  │  ────────────────────   │              │
│  │  api.binance.com        │  │  testnet.binance.vision │              │
│  │                         │  │                         │              │
│  │  • GET /api/v3/ticker   │  │  • GET /api/v3/ticker   │              │
│  │  • GET /api/v3/orderList│  │  • GET /api/v3/orderList│              │
│  │  • DELETE /api/v3/orderList │  • DELETE /api/v3/orderList │         │
│  │                         │  │                         │              │
│  └─────────────────────────┘  └─────────────────────────┘              │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘


┌─────────────────────────────────────────────────────────────────────────┐
│                         DATA FLOW                                        │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  1. USER VISITS /oco PAGE                                               │
│     └─► Check authentication                                            │
│     └─► Fetch OCO orders (GET /api/oco)                                 │
│         └─► Query MongoDB Trade collection                              │
│         └─► Group orders by orderListId                                 │
│         └─► Return OCO orders list                                      │
│     └─► For each unique symbol:                                         │
│         └─► Fetch mainnet price (GET /api/binance/ticker?testnet=false) │
│         └─► Fetch testnet price (GET /api/binance/ticker?testnet=true)  │
│     └─► Display table with dual prices                                  │
│     └─► Auto-refresh prices every 10 seconds                            │
│                                                                          │
│  2. USER CLICKS "VIEW DETAILS"                                          │
│     └─► Navigate to /oco/[orderListId]                                  │
│     └─► Fetch live OCO status (GET /api/trades/oco-status/[id])         │
│         └─► Verify user owns this OCO                                   │
│         └─► Decrypt user's Binance API keys                             │
│         └─► Query Binance API for live status                           │
│         └─► Return orderReports (LIMIT_MAKER + STOP_LOSS_LIMIT)         │
│     └─► Fetch current price (GET /api/binance/ticker)                   │
│     └─► Display order details with progress bars                        │
│     └─► Auto-refresh status every 10 seconds                            │
│                                                                          │
│  3. USER CLICKS "CANCEL OCO ORDER"                                      │
│     └─► Show confirmation dialog                                        │
│     └─► Find trade with this orderListId (GET /api/trades)              │
│     └─► Call close trade endpoint (POST /api/trades/close/[tradeId])    │
│         └─► Cancel OCO via Binance API (DELETE orderList)               │
│         └─► Update Trade status to 'cancelled'                          │
│         └─► Return success response                                     │
│     └─► Show success toast                                              │
│     └─► Refresh order details                                           │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘


┌─────────────────────────────────────────────────────────────────────────┐
│                    AUTO-REFRESH MECHANISM                                │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  List Page (/oco):                                                      │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │  useEffect(() => {                                                │  │
│  │    if (orders.length === 0) return;                               │  │
│  │                                                                    │  │
│  │    const interval = setInterval(() => {                           │  │
│  │      // Fetch mainnet + testnet prices for all symbols            │  │
│  │      refreshPrices();                                             │  │
│  │    }, 10000); // 10 seconds                                       │  │
│  │                                                                    │  │
│  │    return () => clearInterval(interval); // Cleanup on unmount    │  │
│  │  }, [orders]);                                                    │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  Detail Page (/oco/[orderListId]):                                      │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │  useEffect(() => {                                                │  │
│  │    if (!ocoStatus) return;                                        │  │
│  │                                                                    │  │
│  │    const interval = setInterval(() => {                           │  │
│  │      // Fetch live OCO status from Binance                        │  │
│  │      fetchOrderDetails();                                         │  │
│  │    }, 10000); // 10 seconds                                       │  │
│  │                                                                    │  │
│  │    return () => clearInterval(interval); // Cleanup on unmount    │  │
│  │  }, [ocoStatus]);                                                 │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘


┌─────────────────────────────────────────────────────────────────────────┐
│                      SECURITY LAYERS                                     │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  1. AUTHENTICATION                                                      │
│     └─► getUserFromRequest() checks JWT token                           │
│     └─► Returns 401 if unauthorized                                     │
│     └─► All API endpoints protected                                     │
│                                                                          │
│  2. AUTHORIZATION                                                       │
│     └─► User can only see their own OCO orders                          │
│     └─► MongoDB query filters by userId                                 │
│     └─► Detail page verifies ownership via Trade.findOne()              │
│                                                                          │
│  3. INPUT VALIDATION                                                    │
│     └─► orderListId validated as positive integer                       │
│     └─► Query parameters sanitized                                      │
│     └─► MongoDB injection prevented                                     │
│                                                                          │
│  4. API KEY ENCRYPTION                                                  │
│     └─► Binance keys stored encrypted (AES-256-GCM)                     │
│     └─► Decrypted only in memory during API calls                       │
│     └─► Never exposed in logs or responses                              │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

## Component Dependencies

```
app/oco/page.tsx
├── @/components/layout/DashboardLayout
├── @/components/ui/card
├── @/components/ui/button
├── @/components/ui/badge
├── @/components/ui/input
├── @/components/ui/select
├── @/components/ui/table
├── lucide-react (RefreshCw, Eye, Filter, TrendingUp, TrendingDown)
└── sonner (toast)

app/oco/[orderListId]/page.tsx
├── @/components/layout/DashboardLayout
├── @/components/ui/card
├── @/components/ui/button
├── @/components/ui/badge
├── lucide-react (ArrowLeft, RefreshCw, XCircle, CheckCircle2, TrendingUp, TrendingDown)
└── sonner (toast)

app/api/oco/route.ts
├── @/lib/auth (getUserFromRequest)
├── @/lib/db/connection (connectDB)
└── @/lib/db/models/Trade
```

## Navigation Flow

```
Sidebar
  └─► OCO Orders (icon: ListOrdered)
       └─► /oco (List Page)
            ├─► Filter by symbol/status/network
            ├─► View all OCO orders with prices
            └─► Click "View Details"
                 └─► /oco/[orderListId] (Detail Page)
                      ├─► View order details
                      ├─► Monitor execution progress
                      ├─► Cancel order
                      └─► Back to list
```
