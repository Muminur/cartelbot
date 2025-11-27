import { vi } from 'vitest';

/**
 * Mock Binance API responses for testing
 */

// Mock server time response
export const mockServerTime = {
  serverTime: 1700000000000
};

// Mock exchange info response
export const mockExchangeInfo = {
  symbols: [
    {
      symbol: 'BTCUSDT',
      status: 'TRADING',
      baseAsset: 'BTC',
      quoteAsset: 'USDT',
      filters: [
        { filterType: 'PRICE_FILTER', minPrice: '0.01', maxPrice: '1000000', tickSize: '0.01' },
        { filterType: 'LOT_SIZE', minQty: '0.00001', maxQty: '9000', stepSize: '0.00001' },
        { filterType: 'MIN_NOTIONAL', minNotional: '10.0' },
        { filterType: 'MARKET_LOT_SIZE', minQty: '0.00001', maxQty: '9000', stepSize: '0.00001' }
      ]
    },
    {
      symbol: 'ETHUSDT',
      status: 'TRADING',
      baseAsset: 'ETH',
      quoteAsset: 'USDT',
      filters: [
        { filterType: 'PRICE_FILTER', minPrice: '0.01', maxPrice: '1000000', tickSize: '0.01' },
        { filterType: 'LOT_SIZE', minQty: '0.0001', maxQty: '90000', stepSize: '0.0001' },
        { filterType: 'MIN_NOTIONAL', minNotional: '10.0' },
        { filterType: 'MARKET_LOT_SIZE', minQty: '0.0001', maxQty: '90000', stepSize: '0.0001' }
      ]
    }
  ]
};

// Mock account info response
export const mockAccountInfo = {
  balances: [
    { asset: 'USDT', free: '1000.00000000', locked: '0.00000000' },
    { asset: 'BTC', free: '0.50000000', locked: '0.00000000' },
    { asset: 'ETH', free: '5.00000000', locked: '0.00000000' }
  ]
};

// Mock buy order response
export const mockBuyOrder = {
  symbol: 'BTCUSDT',
  orderId: 12345,
  clientOrderId: 'test-buy-order-123',
  transactTime: 1700000001000,
  price: '50000.00',
  origQty: '0.01',
  executedQty: '0.01',
  cummulativeQuoteQty: '500.00',
  status: 'FILLED',
  timeInForce: 'GTC',
  type: 'MARKET',
  side: 'BUY',
  fills: [
    {
      price: '50000.00',
      qty: '0.01',
      commission: '0.00001',
      commissionAsset: 'BTC'
    }
  ]
};

// Mock OCO order response
export const mockOCOOrder = {
  orderListId: 1,
  contingencyType: 'OCO',
  listStatusType: 'EXEC_STARTED',
  listOrderStatus: 'EXECUTING',
  listClientOrderId: 'test-oco-123',
  transactionTime: 1700000002000,
  symbol: 'BTCUSDT',
  orders: [
    { symbol: 'BTCUSDT', orderId: 12346, clientOrderId: 'test-tp-123' },
    { symbol: 'BTCUSDT', orderId: 12347, clientOrderId: 'test-sl-123' }
  ],
  orderReports: [
    {
      symbol: 'BTCUSDT',
      orderId: 12346,
      orderListId: 1,
      clientOrderId: 'test-tp-123',
      transactTime: 1700000002000,
      price: '55000.00',
      origQty: '0.01',
      executedQty: '0.00',
      cummulativeQuoteQty: '0.00',
      status: 'NEW',
      timeInForce: 'GTC',
      type: 'LIMIT_MAKER',
      side: 'SELL',
      stopPrice: '0.00',
      workingTime: 1700000002000
    },
    {
      symbol: 'BTCUSDT',
      orderId: 12347,
      orderListId: 1,
      clientOrderId: 'test-sl-123',
      transactTime: 1700000002000,
      price: '45000.00',
      origQty: '0.01',
      executedQty: '0.00',
      cummulativeQuoteQty: '0.00',
      status: 'NEW',
      timeInForce: 'GTC',
      type: 'STOP_LOSS_LIMIT',
      side: 'SELL',
      stopPrice: '45000.00',
      workingTime: -1
    }
  ]
};

// Mock WebSocket user data stream response
export const mockListenKey = {
  listenKey: 'test-listen-key-123456'
};

// Mock 24hr ticker response
export const mockTicker = {
  symbol: 'BTCUSDT',
  priceChange: '1000.00',
  priceChangePercent: '2.00',
  lastPrice: '51000.00',
  volume: '10000.00',
  quoteVolume: '500000000.00'
};

/**
 * Create mock BinanceClient for testing
 */
export function createMockBinanceClient() {
  return {
    getServerTime: vi.fn().mockResolvedValue(mockServerTime),
    getExchangeInfo: vi.fn().mockResolvedValue(mockExchangeInfo),
    getAccountInfo: vi.fn().mockResolvedValue(mockAccountInfo),
    createOrder: vi.fn().mockResolvedValue(mockBuyOrder),
    createOCOOrder: vi.fn().mockResolvedValue(mockOCOOrder),
    createListenKey: vi.fn().mockResolvedValue(mockListenKey),
    get24hrTicker: vi.fn().mockResolvedValue(mockTicker),
    cancelOrder: vi.fn().mockResolvedValue({ orderId: 12345, status: 'CANCELED' }),
    cancelOCOOrder: vi.fn().mockResolvedValue({ orderListId: 1, listOrderStatus: 'ALL_DONE' }),
    getOrder: vi.fn().mockResolvedValue(mockBuyOrder),
    getOCOOrder: vi.fn().mockResolvedValue(mockOCOOrder)
  };
}
