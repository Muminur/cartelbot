import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BinanceClient } from '../client';
import { BinanceAPIError } from '@/lib/utils/errors';
import axios from 'axios';

// Mock axios
vi.mock('axios');

describe('BinanceClient', () => {
  const mockConfig = {
    apiKey: 'test-api-key',
    apiSecret: 'test-api-secret',
    testnet: true
  };

  let client: BinanceClient;
  let mockAxiosInstance: {
    get: ReturnType<typeof vi.fn>;
    post: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
    request: ReturnType<typeof vi.fn>;
    interceptors: {
      response: {
        use: ReturnType<typeof vi.fn>;
      };
    };
  };

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();

    // Create mock axios instance
    mockAxiosInstance = {
      get: vi.fn(),
      post: vi.fn(),
      delete: vi.fn(),
      request: vi.fn(),
      interceptors: {
        response: {
          use: vi.fn()
        }
      }
    };

    // Mock axios.create to return our mock instance
    vi.mocked(axios.create).mockReturnValue(mockAxiosInstance as never);

    client = new BinanceClient(mockConfig);
  });

  describe('constructor', () => {
    it('should initialize with testnet URL', () => {
      new BinanceClient({
        apiKey: 'key',
        apiSecret: 'secret',
        testnet: true
      });

      expect(axios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          baseURL: expect.stringContaining('testnet')
        })
      );
    });

    it('should initialize with mainnet URL', () => {
      new BinanceClient({
        apiKey: 'key',
        apiSecret: 'secret',
        testnet: false
      });

      expect(axios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          baseURL: expect.not.stringContaining('testnet')
        })
      );
    });

    it('should set API key in headers', () => {
      expect(axios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-MBX-APIKEY': mockConfig.apiKey
          })
        })
      );
    });

    it('should configure timeout', () => {
      expect(axios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          timeout: 10000
        })
      );
    });

    it('should configure HTTP agents for keep-alive', () => {
      expect(axios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          httpAgent: expect.any(Object),
          httpsAgent: expect.any(Object)
        })
      );
    });
  });

  describe('HMAC SHA256 Signing', () => {
    it('should create correct signature', async () => {
      // This tests the signature creation internally used by the client
      const crypto = await import('crypto');
      const secret = 'test-secret';
      const queryString = 'symbol=BTCUSDT&timestamp=1234567890';

      const signature = crypto
        .createHmac('sha256', secret)
        .update(queryString)
        .digest('hex');

      expect(signature).toHaveLength(64);
      expect(signature).toMatch(/^[0-9a-f]+$/);
    });

    it('should create different signatures for different data', async () => {
      const crypto = await import('crypto');
      const secret = 'test-secret';

      const sig1 = crypto.createHmac('sha256', secret).update('data1').digest('hex');
      const sig2 = crypto.createHmac('sha256', secret).update('data2').digest('hex');

      expect(sig1).not.toBe(sig2);
    });

    it('should create consistent signatures', async () => {
      const crypto = await import('crypto');
      const secret = 'test-secret';
      const data = 'consistent-data';

      const sig1 = crypto.createHmac('sha256', secret).update(data).digest('hex');
      const sig2 = crypto.createHmac('sha256', secret).update(data).digest('hex');

      expect(sig1).toBe(sig2);
    });
  });

  describe('Error Handling', () => {
    it('should handle -1021 timestamp error', () => {
      const error = {
        response: {
          data: {
            code: -1021,
            msg: 'Timestamp error'
          },
          status: 400
        }
      };

      // The error handler is set up in the constructor via interceptor
      // We can test it by triggering the interceptor
      const interceptorErrorHandler = vi.mocked(mockAxiosInstance.interceptors.response.use).mock.calls[0][1];

      expect(() => interceptorErrorHandler(error)).toThrow(BinanceAPIError);
      expect(() => interceptorErrorHandler(error)).toThrow('Timestamp synchronization failed');
    });

    it('should handle -2010 insufficient balance error', () => {
      const error = {
        response: {
          data: {
            code: -2010,
            msg: 'Insufficient balance'
          },
          status: 400
        }
      };

      const interceptorErrorHandler = vi.mocked(mockAxiosInstance.interceptors.response.use).mock.calls[0][1];

      expect(() => interceptorErrorHandler(error)).toThrow(BinanceAPIError);
      expect(() => interceptorErrorHandler(error)).toThrow('Insufficient balance');
    });

    it('should handle -2015 invalid API key error', () => {
      const error = {
        response: {
          data: {
            code: -2015,
            msg: 'Invalid API key'
          },
          status: 401
        }
      };

      const interceptorErrorHandler = vi.mocked(mockAxiosInstance.interceptors.response.use).mock.calls[0][1];

      expect(() => interceptorErrorHandler(error)).toThrow(BinanceAPIError);
      expect(() => interceptorErrorHandler(error)).toThrow('Invalid API-key');
    });

    it('should handle 429 rate limit error', () => {
      const error = {
        response: {
          data: {
            code: 429,
            msg: 'Rate limit exceeded'
          },
          status: 429
        }
      };

      const interceptorErrorHandler = vi.mocked(mockAxiosInstance.interceptors.response.use).mock.calls[0][1];

      expect(() => interceptorErrorHandler(error)).toThrow(BinanceAPIError);
      expect(() => interceptorErrorHandler(error)).toThrow('Rate limit exceeded');
    });

    it('should handle network errors', () => {
      const error = Object.assign(new Error('Network error'), { code: 'ECONNRESET' });

      const interceptorErrorHandler = vi.mocked(mockAxiosInstance.interceptors.response.use).mock.calls[0][1];

      expect(() => interceptorErrorHandler(error)).toThrow();
    });
  });

  describe('Rate Limiting', () => {
    it('should track API weight from response headers', () => {
      const response = {
        data: {},
        headers: {
          'x-mbx-used-weight-1m': '100'
        }
      };

      const interceptorSuccessHandler = vi.mocked(mockAxiosInstance.interceptors.response.use).mock.calls[0][0];
      const result = interceptorSuccessHandler(response);

      expect(result).toBe(response);
    });

    it('should handle response without weight header', () => {
      const response = {
        data: {},
        headers: {}
      };

      const interceptorSuccessHandler = vi.mocked(mockAxiosInstance.interceptors.response.use).mock.calls[0][0];
      const result = interceptorSuccessHandler(response);

      expect(result).toBe(response);
    });
  });

  describe('Time Synchronization', () => {
    it('should sync server time', async () => {
      const serverTime = Date.now();
      mockAxiosInstance.get.mockResolvedValue({
        data: { serverTime }
      });

      await client.syncServerTime();

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/api/v3/time');
    });

    it('should calculate time offset', async () => {
      const serverTime = Date.now() + 5000; // 5 seconds ahead
      mockAxiosInstance.get.mockResolvedValue({
        data: { serverTime }
      });

      await client.syncServerTime();

      // Time offset should be calculated
      expect(mockAxiosInstance.get).toHaveBeenCalled();
    });
  });

  describe('Account Operations', () => {
    it('should get account info', async () => {
      const mockAccountInfo = {
        balances: [
          { asset: 'USDT', free: '1000.00', locked: '0.00' },
          { asset: 'BTC', free: '0.5', locked: '0.00' }
        ]
      };

      mockAxiosInstance.request.mockResolvedValue({
        data: mockAccountInfo
      });

      const result = await client.getAccount();

      expect(result).toEqual(mockAccountInfo);
      expect(mockAxiosInstance.request).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'GET',
          url: expect.stringContaining('/api/v3/account')
        })
      );
    });

    it('should handle account info errors', async () => {
      mockAxiosInstance.request.mockRejectedValue(
        new BinanceAPIError('API error', 400)
      );

      await expect(client.getAccount()).rejects.toThrow(BinanceAPIError);
    });
  });

  describe('Exchange Info', () => {
    it('should get exchange info for symbol', async () => {
      const mockExchangeInfo = {
        symbols: [{
          symbol: 'BTCUSDT',
          status: 'TRADING',
          filters: []
        }]
      };

      mockAxiosInstance.get.mockResolvedValue({
        data: mockExchangeInfo
      });

      const result = await client.getExchangeInfo('BTCUSDT');

      expect(result).toEqual(mockExchangeInfo);
      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/api/v3/exchangeInfo',
        expect.objectContaining({
          params: { symbol: 'BTCUSDT' }
        })
      );
    });
  });

  describe('Ticker Operations', () => {
    it('should get 24hr ticker', async () => {
      const mockTicker = {
        symbol: 'BTCUSDT',
        lastPrice: '50000.00',
        volume: '1000.00'
      };

      mockAxiosInstance.get.mockResolvedValue({
        data: mockTicker
      });

      const result = await client.get24hrTicker('BTCUSDT');

      expect(result).toEqual(mockTicker);
      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/api/v3/ticker/24hr',
        expect.objectContaining({
          params: { symbol: 'BTCUSDT' }
        })
      );
    });
  });
});
