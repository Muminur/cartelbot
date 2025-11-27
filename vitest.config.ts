import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    // Test environment
    environment: 'happy-dom',

    // Global setup file
    setupFiles: ['./test/setup.ts'],

    // Include test files
    include: [
      'lib/**/*.test.ts',
      'lib/**/*.test.tsx',
      'test/unit/**/*.test.ts',
      'test/unit/**/*.test.tsx'
    ],

    // Exclude directories
    exclude: [
      'node_modules',
      '.next',
      'dist',
      'build',
      'e2e',
      'test/integration/**'
    ],

    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      reportsDirectory: './coverage',

      // Coverage thresholds
      thresholds: {
        lines: 60,
        functions: 60,
        branches: 60,
        statements: 60
      },

      // Files to include in coverage
      include: [
        'lib/**/*.ts',
        'lib/**/*.tsx'
      ],

      // Files to exclude from coverage
      exclude: [
        'lib/**/*.test.ts',
        'lib/**/*.test.tsx',
        'lib/**/index.ts',
        'lib/types/**',
        'lib/config/**',
        'lib/constants/**',
        '**/__tests__/**',
        '**/node_modules/**',
        '**/.next/**'
      ]
    },

    // Test globals (describe, it, expect, beforeEach, afterEach)
    globals: true,

    // Mock environment
    mockReset: true,
    clearMocks: true,
    restoreMocks: true,

    // Test timeout
    testTimeout: 10000,
    hookTimeout: 10000
  },

  // Resolve aliases
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './')
    }
  }
});
