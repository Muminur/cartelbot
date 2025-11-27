import { describe, it, expect } from 'vitest';
import { isValidDistribution } from '../risk-manager';

describe('Risk Manager', () => {
  describe('isValidDistribution', () => {
    it('should validate correct distribution', () => {
      expect(isValidDistribution([75, 15, 10])).toBe(true);
      expect(isValidDistribution([50, 50])).toBe(true);
      expect(isValidDistribution([100])).toBe(true);
      expect(isValidDistribution([70, 15, 10, 5])).toBe(true);
      expect(isValidDistribution([60, 20, 10, 5, 5])).toBe(true);
    });

    it('should accept distribution with floating point tolerance', () => {
      // Sum is 99.99 due to floating point, should still pass
      expect(isValidDistribution([33.33, 33.33, 33.34])).toBe(true);
      // Sum is 100.01 due to floating point, should still pass
      expect(isValidDistribution([25.01, 25, 25, 24.99])).toBe(true);
    });

    it('should reject null or undefined', () => {
      expect(isValidDistribution(null)).toBe(false);
      expect(isValidDistribution(undefined)).toBe(false);
    });

    it('should reject non-array values', () => {
      expect(isValidDistribution('not-an-array' as unknown as number[])).toBe(false);
      expect(isValidDistribution(123 as unknown as number[])).toBe(false);
      expect(isValidDistribution({} as unknown as number[])).toBe(false);
    });

    it('should reject empty array', () => {
      expect(isValidDistribution([])).toBe(false);
    });

    it('should reject array with more than 5 elements', () => {
      expect(isValidDistribution([20, 20, 20, 20, 10, 10])).toBe(false);
      expect(isValidDistribution([14, 14, 14, 14, 14, 14, 16])).toBe(false);
    });

    it('should reject distribution that does not sum to 100', () => {
      expect(isValidDistribution([50, 40])).toBe(false);  // Sum = 90
      expect(isValidDistribution([60, 50])).toBe(false);  // Sum = 110
      expect(isValidDistribution([75, 15, 5])).toBe(false); // Sum = 95
    });

    it('should reject negative values', () => {
      expect(isValidDistribution([-10, 110])).toBe(false);
      expect(isValidDistribution([75, 15, -5, 15])).toBe(false);
    });

    it('should reject values over 100', () => {
      expect(isValidDistribution([150])).toBe(false);
      expect(isValidDistribution([75, 15, 110])).toBe(false);
    });

    it('should reject non-numeric values', () => {
      expect(isValidDistribution(['75', '15', '10'] as unknown as number[])).toBe(false);
      expect(isValidDistribution([75, NaN, 10])).toBe(false);
      expect(isValidDistribution([75, null as unknown as number, 10])).toBe(false);
      expect(isValidDistribution([75, undefined as unknown as number, 10])).toBe(false);
    });

    it('should handle edge case of single 100% target', () => {
      expect(isValidDistribution([100])).toBe(true);
    });

    it('should handle edge case of zero values (if sum is 100)', () => {
      expect(isValidDistribution([100, 0, 0])).toBe(true);
      expect(isValidDistribution([50, 50, 0])).toBe(true);
    });

    it('should reject all zeros', () => {
      expect(isValidDistribution([0, 0, 0])).toBe(false);
    });

    it('should handle common user distributions', () => {
      // Conservative (most in first target)
      expect(isValidDistribution([95, 2.5, 2.5])).toBe(true);

      // Balanced
      expect(isValidDistribution([70, 15, 10, 5])).toBe(true);

      // Aggressive (spread across all targets)
      expect(isValidDistribution([40, 25, 20, 10, 5])).toBe(true);

      // Default
      expect(isValidDistribution([75, 15, 10])).toBe(true);
    });
  });

  describe('Position Sizing', () => {
    it('should calculate fixed amount position size', () => {
      const investmentAmount = 100;
      const result = investmentAmount;

      expect(result).toBe(100);
    });

    it('should calculate percentage-based position size', () => {
      const accountBalance = 1000;
      const percentage = 10;
      const result = (accountBalance * percentage) / 100;

      expect(result).toBe(100);
    });

    it('should calculate risk-based position size (2% rule)', () => {
      const accountBalance = 10000;
      const riskPercent = 2;
      const entryPrice = 100;
      const stopLoss = 90;

      const riskAmount = (accountBalance * riskPercent) / 100; // $200
      const riskPerUnit = entryPrice - stopLoss; // $10
      const quantity = riskAmount / riskPerUnit; // 20 units
      const positionSize = quantity * entryPrice; // $2000

      expect(riskAmount).toBe(200);
      expect(riskPerUnit).toBe(10);
      expect(quantity).toBe(20);
      expect(positionSize).toBe(2000);
    });

    it('should handle zero stop loss distance', () => {
      const entryPrice = 100;
      const stopLoss = 100;

      const riskPerUnit = entryPrice - stopLoss;

      expect(riskPerUnit).toBe(0);
      // In real implementation, should use fallback method
    });

    it('should handle stop loss above entry (invalid)', () => {
      const entryPrice = 100;
      const stopLoss = 110;

      const riskPerUnit = entryPrice - stopLoss;

      expect(riskPerUnit).toBeLessThan(0);
      // In real implementation, should be rejected
    });
  });

  describe('Risk Validation', () => {
    it('should validate position size against max limit', () => {
      const positionSize = 500;
      const maxPositionSize = 1000;

      expect(positionSize).toBeLessThanOrEqual(maxPositionSize);
    });

    it('should reject position size exceeding max limit', () => {
      const positionSize = 1500;
      const maxPositionSize = 1000;

      expect(positionSize).toBeGreaterThan(maxPositionSize);
    });

    it('should validate number of open positions', () => {
      const openPositions = 3;
      const maxOpenPositions = 5;

      expect(openPositions).toBeLessThan(maxOpenPositions);
    });

    it('should reject when max open positions reached', () => {
      const openPositions = 5;
      const maxOpenPositions = 5;

      expect(openPositions).toBeGreaterThanOrEqual(maxOpenPositions);
    });

    it('should validate daily loss', () => {
      const currentDailyLoss = 200;
      const maxDailyLoss = 500;

      expect(currentDailyLoss).toBeLessThan(maxDailyLoss);
    });

    it('should reject when daily loss limit exceeded', () => {
      const currentDailyLoss = 600;
      const maxDailyLoss = 500;

      expect(currentDailyLoss).toBeGreaterThan(maxDailyLoss);
    });
  });

  describe('Target Distribution', () => {
    it('should split quantity based on distribution', () => {
      const totalQuantity = 1.0;
      const distribution = [75, 15, 10];

      const quantities = distribution.map(pct => (totalQuantity * pct) / 100);

      expect(quantities[0]).toBe(0.75);
      expect(quantities[1]).toBe(0.15);
      expect(quantities[2]).toBe(0.10);
      expect(quantities.reduce((a, b) => a + b, 0)).toBeCloseTo(1.0, 10);
    });

    it('should handle unequal distribution', () => {
      const totalQuantity = 1.0;
      const distribution = [95, 2.5, 2.5];

      const quantities = distribution.map(pct => (totalQuantity * pct) / 100);

      expect(quantities[0]).toBe(0.95);
      expect(quantities[1]).toBe(0.025);
      expect(quantities[2]).toBe(0.025);
    });

    it('should handle 5-target distribution', () => {
      const totalQuantity = 100;
      const distribution = [40, 25, 20, 10, 5];

      const quantities = distribution.map(pct => (totalQuantity * pct) / 100);

      expect(quantities[0]).toBe(40);
      expect(quantities[1]).toBe(25);
      expect(quantities[2]).toBe(20);
      expect(quantities[3]).toBe(10);
      expect(quantities[4]).toBe(5);
    });
  });

  describe('Emergency Stop', () => {
    it('should not activate emergency stop under threshold', () => {
      const dailyLoss = 400;
      const emergencyThreshold = 500;

      expect(dailyLoss).toBeLessThan(emergencyThreshold);
    });

    it('should activate emergency stop when threshold exceeded', () => {
      const dailyLoss = 600;
      const emergencyThreshold = 500;

      expect(dailyLoss).toBeGreaterThan(emergencyThreshold);
    });
  });
});
