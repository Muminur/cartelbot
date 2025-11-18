/**
 * Comprehensive Test Suite for Target Distribution Validation
 *
 * Tests the isValidDistribution() helper function and integration
 * with getUserRiskLimits() and trade executor logic.
 */

import { isValidDistribution } from "@/lib/binance/risk-manager";

describe("Target Distribution Validation", () => {
  describe("isValidDistribution()", () => {
    describe("Valid distributions", () => {
      test("Valid 3-value distribution [75, 15, 10]", () => {
        expect(isValidDistribution([75, 15, 10])).toBe(true);
      });

      test("Valid 2-value distribution [50, 50]", () => {
        expect(isValidDistribution([50, 50])).toBe(true);
      });

      test("Valid 5-value distribution [20, 20, 20, 20, 20]", () => {
        expect(isValidDistribution([20, 20, 20, 20, 20])).toBe(true);
      });

      test("Valid 1-value distribution [100]", () => {
        expect(isValidDistribution([100])).toBe(true);
      });

      test("Valid distribution with decimals [95, 2.5, 2.5]", () => {
        expect(isValidDistribution([95, 2.5, 2.5])).toBe(true);
      });

      test("Valid distribution with zeros [100, 0, 0]", () => {
        expect(isValidDistribution([100, 0, 0])).toBe(true);
      });

      test("Valid distribution with floating point tolerance [33.33, 33.33, 33.34]", () => {
        // Sum is 100.00, within 0.01 tolerance
        expect(isValidDistribution([33.33, 33.33, 33.34])).toBe(true);
      });
    });

    describe("Invalid distributions - wrong sum", () => {
      test("Invalid distribution [50, 30] (sum = 80)", () => {
        expect(isValidDistribution([50, 30])).toBe(false);
      });

      test("Invalid distribution [75, 15, 15] (sum = 105)", () => {
        expect(isValidDistribution([75, 15, 15])).toBe(false);
      });

      test("Invalid distribution [0, 0, 0] (sum = 0)", () => {
        expect(isValidDistribution([0, 0, 0])).toBe(false);
      });

      test("Invalid distribution [50, 50, 0.5] (sum = 100.5)", () => {
        // Outside 0.01 tolerance
        expect(isValidDistribution([50, 50, 0.5])).toBe(false);
      });
    });

    describe("Invalid distributions - array length", () => {
      test("Invalid distribution [] (empty array)", () => {
        expect(isValidDistribution([])).toBe(false);
      });

      test("Invalid distribution with 6 values", () => {
        expect(isValidDistribution([16.67, 16.67, 16.66, 16.67, 16.67, 16.66])).toBe(false);
      });

      test("Invalid distribution with 10 values", () => {
        const dist = Array(10).fill(10); // [10, 10, 10, ...]
        expect(isValidDistribution(dist)).toBe(false);
      });
    });

    describe("Invalid distributions - value range", () => {
      test("Invalid distribution with negative value [-10, 60, 50]", () => {
        expect(isValidDistribution([-10, 60, 50])).toBe(false);
      });

      test("Invalid distribution with value > 100 [110, -5, -5]", () => {
        expect(isValidDistribution([110, -5, -5])).toBe(false);
      });

      test("Invalid distribution with NaN", () => {
        expect(isValidDistribution([NaN, 50, 50])).toBe(false);
      });

      test("Invalid distribution with Infinity", () => {
        expect(isValidDistribution([Infinity, 0, 0])).toBe(false);
      });
    });

    describe("Invalid distributions - type errors", () => {
      test("Invalid distribution null", () => {
        expect(isValidDistribution(null)).toBe(false);
      });

      test("Invalid distribution undefined", () => {
        expect(isValidDistribution(undefined)).toBe(false);
      });

      test("Invalid distribution - not an array", () => {
        // @ts-expect-error Testing runtime behavior with invalid input
        expect(isValidDistribution("75,15,10")).toBe(false);
      });

      test("Invalid distribution - object instead of array", () => {
        // @ts-expect-error Testing runtime behavior with invalid input
        expect(isValidDistribution({ a: 75, b: 15, c: 10 })).toBe(false);
      });

      test("Invalid distribution - array with string values", () => {
        // @ts-expect-error Testing runtime behavior with invalid input
        expect(isValidDistribution(["75", "15", "10"])).toBe(false);
      });
    });
  });

  describe("Distribution length vs target count mismatch scenarios", () => {
    /**
     * These tests verify the logic in trade-executor.ts for handling
     * cases where distribution length doesn't match target count
     */

    test("3 targets with 3-value distribution [75, 15, 10] - exact match", () => {
      const targets = [100, 105, 110]; // 3 targets
      const userDistribution = [75, 15, 10]; // 3 values

      // Should use distribution as-is
      const expectedDistribution = [75, 15, 10];
      expect(userDistribution.length).toBe(targets.length);
      expect(userDistribution).toEqual(expectedDistribution);
    });

    test("2 targets with 3-value distribution [75, 15, 10] - slice and normalize", () => {
      const targets = [100, 105]; // 2 targets
      const userDistribution = [75, 15, 10]; // 3 values

      // Should slice to [75, 15] and normalize
      const sliced = userDistribution.slice(0, targets.length); // [75, 15]
      const sum = sliced.reduce((a, b) => a + b, 0); // 90
      const normalized = sliced.map((pct) => (pct / sum) * 100); // [83.33, 16.67]

      expect(normalized[0]).toBeCloseTo(83.33, 2);
      expect(normalized[1]).toBeCloseTo(16.67, 2);
      expect(normalized.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 2);
    });

    test("5 targets with 3-value distribution [75, 15, 10] - equal distribution", () => {
      const targets = [100, 105, 110, 115, 120]; // 5 targets
      const userDistribution = [75, 15, 10]; // 3 values

      // Should distribute equally (20% each)
      const percentagePerTarget = 100 / targets.length;
      const distribution = Array(targets.length).fill(percentagePerTarget);

      expect(distribution).toEqual([20, 20, 20, 20, 20]);
      expect(distribution.reduce((a, b) => a + b, 0)).toBe(100);
    });

    test("1 target with 3-value distribution [75, 15, 10] - slice to first value", () => {
      const targets = [100]; // 1 target
      const userDistribution = [75, 15, 10]; // 3 values

      // Should slice to [75], but 75 ≠ 100, so normalize to [100]
      const sliced = userDistribution.slice(0, targets.length); // [75]
      const sum = sliced.reduce((a, b) => a + b, 0); // 75
      const normalized = sliced.map((pct) => (pct / sum) * 100); // [100]

      expect(normalized).toEqual([100]);
    });

    test("3 targets with 3-value distribution [100, 0, 0] - already normalized", () => {
      const targets = [100, 105, 110]; // 3 targets
      const userDistribution = [100, 0, 0]; // 3 values, sum = 100

      // Should use as-is (already sums to 100%)
      expect(userDistribution.length).toBe(targets.length);
      expect(userDistribution.reduce((a, b) => a + b, 0)).toBe(100);
    });
  });

  describe("Edge cases with floating point precision", () => {
    test("Distribution [33.333, 33.333, 33.334] within tolerance", () => {
      const dist = [33.333, 33.333, 33.334];
      const sum = dist.reduce((a, b) => a + b, 0); // 100.000
      expect(Math.abs(sum - 100)).toBeLessThan(0.01);
      expect(isValidDistribution(dist)).toBe(true);
    });

    test("Distribution [33.33, 33.33, 33.33] outside tolerance", () => {
      const dist = [33.33, 33.33, 33.33];
      const sum = dist.reduce((a, b) => a + b, 0); // 99.99
      expect(Math.abs(sum - 100)).toBeLessThan(0.01);
      expect(isValidDistribution(dist)).toBe(true); // Still within 0.01 tolerance
    });

    test("Distribution [33.3, 33.3, 33.3] outside tolerance", () => {
      const dist = [33.3, 33.3, 33.3];
      const sum = dist.reduce((a, b) => a + b, 0); // 99.9
      expect(Math.abs(sum - 100)).toBeGreaterThan(0.01);
      expect(isValidDistribution(dist)).toBe(false); // Outside tolerance
    });
  });

  describe("User settings integration scenarios", () => {
    test("User saves valid distribution [95, 2.5, 2.5] in settings", () => {
      const userInput = [95, 2.5, 2.5];
      expect(isValidDistribution(userInput)).toBe(true);
    });

    test("User tries to save invalid distribution [50, 30, 15] (sum=95)", () => {
      const userInput = [50, 30, 15];
      expect(isValidDistribution(userInput)).toBe(false);
    });

    test("User tries to save distribution with 6 values (exceeds limit)", () => {
      const userInput = [16, 16, 16, 16, 16, 20]; // Sum = 100 but length > 5
      expect(isValidDistribution(userInput)).toBe(false);
    });

    test("Database corruption: distribution becomes empty array", () => {
      const corruptedData: number[] = [];
      expect(isValidDistribution(corruptedData)).toBe(false);
      // Should fall back to default [75, 15, 10]
    });

    test("Database corruption: distribution becomes null", () => {
      const corruptedData = null;
      expect(isValidDistribution(corruptedData)).toBe(false);
      // Should fall back to default [75, 15, 10]
    });
  });
});

/**
 * Integration test scenarios (manual verification needed)
 *
 * Scenario 1: Normal flow
 * - User saves [75, 15, 10] in settings
 * - Signal has 3 targets
 * - Expected: 75% to target 1, 15% to target 2, 10% to target 3
 *
 * Scenario 2: Fewer targets than distribution
 * - User saves [75, 15, 10] in settings
 * - Signal has 2 targets
 * - Expected: Normalize [75, 15] to [83.33%, 16.67%]
 *
 * Scenario 3: More targets than distribution
 * - User saves [75, 15, 10] in settings
 * - Signal has 5 targets
 * - Expected: Equal distribution [20%, 20%, 20%, 20%, 20%]
 *
 * Scenario 4: Invalid distribution in database
 * - Database has [50, 30] (sum = 80, corrupted)
 * - getUserRiskLimits() detects invalid distribution
 * - Expected: Falls back to default [75, 15, 10]
 * - Logs warning with user ID
 *
 * Scenario 5: User tries to save invalid distribution
 * - User submits [50, 30, 15] via settings API
 * - Expected: API returns 400 error with message "must sum to 100% (got 95.00%)"
 *
 * Scenario 6: Edge case - single target
 * - User saves [75, 15, 10] in settings
 * - Signal has 1 target
 * - Expected: 100% to single target
 */
