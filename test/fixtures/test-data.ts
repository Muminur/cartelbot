/**
 * Test fixtures for CartelBot testing
 */

// Test user data
export const testUsers = {
  basicUser: {
    email: 'test@example.com',
    binanceApiKey: 'test-api-key-123',
    binanceApiSecret: 'test-api-secret-456',
    isTestnet: true,
    subscription: {
      tier: 'free' as const,
      status: 'active' as const,
      startDate: new Date('2024-01-01'),
      endDate: new Date('2024-12-31')
    },
    riskLimits: {
      maxPositionSize: 100,
      maxOpenPositions: 5,
      dailyLossLimit: 50,
      positionSizingMethod: 'fixed' as const,
      investmentAmount: 20,
      riskPercentage: 2,
      targetDistribution: [75, 15, 10],
      maxTargets: 5
    },
    notifications: {
      tradeExecuted: true,
      targetHit: true,
      stopLossHit: true
    },
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01')
  },
  premiumUser: {
    email: 'premium@example.com',
    binanceApiKey: 'premium-api-key-789',
    binanceApiSecret: 'premium-api-secret-101',
    isTestnet: false,
    subscription: {
      tier: 'premium' as const,
      status: 'active' as const,
      startDate: new Date('2024-01-01'),
      endDate: new Date('2024-12-31')
    },
    riskLimits: {
      maxPositionSize: 500,
      maxOpenPositions: 10,
      dailyLossLimit: 200,
      positionSizingMethod: 'risk_based' as const,
      investmentAmount: 100,
      riskPercentage: 2,
      targetDistribution: [70, 15, 10, 5],
      maxTargets: 5
    },
    notifications: {
      tradeExecuted: true,
      targetHit: true,
      stopLossHit: true
    },
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01')
  }
};

// Test signal data
export const testSignals = {
  percentageSignal: {
    text: `Buying $BTC
First buying: 50000 – 51000
Targets: 4%, 8%, 12%, 20%
Sl: 45000`,
    parsed: {
      symbol: 'BTCUSDT',
      entries: [50000, 51000],
      targets: [52000, 54000, 56000, 60000],
      stopLoss: 45000,
      confidence: 100,
      errors: []
    }
  },
  priceSignal: {
    text: `$ETH Buying Now:
Entry: 3000 - 3100
Targets: 3200, 3400, 3600, 3800
SL: 2800`,
    parsed: {
      symbol: 'ETHUSDT',
      entries: [3000, 3100],
      targets: [3200, 3400, 3600, 3800],
      stopLoss: 2800,
      confidence: 100,
      errors: []
    }
  },
  cmpSignal: {
    text: `Buying $BNB
First buying: 400 – 410
CMP: 405
Targets: 420, 440, 460, 480, 500
Sl: 380`,
    parsed: {
      symbol: 'BNBUSDT',
      entries: [400, 410],
      currentMarketPrice: 405,
      targets: [420, 440, 460, 480, 500],
      stopLoss: 380,
      confidence: 100,
      errors: []
    }
  }
};

// Test trade data
export const testTrades = {
  openTrade: {
    status: 'open' as const,
    buyOrder: {
      orderId: 12345,
      symbol: 'BTCUSDT',
      side: 'BUY' as const,
      type: 'MARKET' as const,
      quantity: 0.01,
      price: 50000,
      executedQty: 0.01,
      cummulativeQuoteQty: 500,
      status: 'FILLED' as const,
      timeInForce: 'GTC' as const,
      fills: [
        {
          price: '50000.00',
          qty: '0.01',
          commission: '0.00001',
          commissionAsset: 'BTC'
        }
      ]
    },
    sellOrders: [
      {
        orderListId: 1,
        symbol: 'BTCUSDT',
        orders: [
          { orderId: 12346, clientOrderId: 'tp-1-123' },
          { orderId: 12347, clientOrderId: 'sl-123' }
        ],
        orderReports: [
          {
            orderId: 12346,
            status: 'NEW' as const,
            type: 'LIMIT_MAKER' as const,
            side: 'SELL' as const,
            price: '55000.00',
            origQty: '0.0075',
            executedQty: '0.00',
            cummulativeQuoteQty: '0.00'
          },
          {
            orderId: 12347,
            status: 'NEW' as const,
            type: 'STOP_LOSS_LIMIT' as const,
            side: 'SELL' as const,
            price: '45000.00',
            stopPrice: '45000.00',
            origQty: '0.01',
            executedQty: '0.00',
            cummulativeQuoteQty: '0.00'
          }
        ]
      }
    ],
    investedAmount: 500,
    currentValue: 510,
    profitLoss: 10,
    profitLossPercentage: 2
  }
};

// Test API responses
export const testApiResponses = {
  success: {
    success: true,
    message: 'Operation successful'
  },
  error: {
    success: false,
    error: 'Test error message'
  }
};
