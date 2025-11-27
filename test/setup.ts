// Mock environment variables for testing
// TypeScript marks NODE_ENV as readonly, but we can assign it at runtime
(process.env as { NODE_ENV?: string }).NODE_ENV = 'test';
process.env.DATABASE_URL = 'mongodb://localhost:27017/cartelbot-test';
process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing-only-minimum-32-characters';
process.env.ENCRYPTION_KEY = 'test-encryption-key-32-chars-minimum-length-required!!';
process.env.BINANCE_API_URL = 'https://api.binance.com';
process.env.BINANCE_TESTNET_URL = 'https://testnet.binance.vision';
process.env.BINANCE_WS_URL = 'wss://stream.binance.com:9443';
process.env.BINANCE_TESTNET_WS = 'wss://testnet-stream.binance.vision';
