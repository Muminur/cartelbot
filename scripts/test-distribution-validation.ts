/**
 * Manual test script to validate target distribution validation logic
 * Run with: npx tsx scripts/test-distribution-validation.ts
 */

import { isValidDistribution } from "../lib/binance/risk-manager";

console.log("=== Target Distribution Validation Tests ===\n");

interface TestCase {
  name: string;
  input: number[] | null | undefined;
  expected: boolean;
}

const testCases: TestCase[] = [
  // Valid distributions
  { name: "Valid [75, 15, 10]", input: [75, 15, 10], expected: true },
  { name: "Valid [50, 50]", input: [50, 50], expected: true },
  { name: "Valid [20, 20, 20, 20, 20]", input: [20, 20, 20, 20, 20], expected: true },
  { name: "Valid [100]", input: [100], expected: true },
  { name: "Valid [95, 2.5, 2.5]", input: [95, 2.5, 2.5], expected: true },
  { name: "Valid [100, 0, 0]", input: [100, 0, 0], expected: true },
  { name: "Valid [33.33, 33.33, 33.34]", input: [33.33, 33.33, 33.34], expected: true },

  // Invalid - wrong sum
  { name: "Invalid [50, 30] (sum=80)", input: [50, 30], expected: false },
  { name: "Invalid [75, 15, 15] (sum=105)", input: [75, 15, 15], expected: false },
  { name: "Invalid [0, 0, 0] (sum=0)", input: [0, 0, 0], expected: false },
  { name: "Invalid [50, 50, 0.5] (sum=100.5)", input: [50, 50, 0.5], expected: false },

  // Invalid - array length
  { name: "Invalid [] (empty)", input: [], expected: false },
  {
    name: "Invalid 6 values",
    input: [16.67, 16.67, 16.66, 16.67, 16.67, 16.66],
    expected: false,
  },

  // Invalid - value range
  { name: "Invalid [-10, 60, 50]", input: [-10, 60, 50], expected: false },
  { name: "Invalid [110, -5, -5]", input: [110, -5, -5], expected: false },
  { name: "Invalid with NaN", input: [NaN, 50, 50], expected: false },

  // Invalid - type errors
  { name: "Invalid null", input: null, expected: false },
  { name: "Invalid undefined", input: undefined, expected: false },
];

let passed = 0;
let failed = 0;

console.log("Running validation tests...\n");

testCases.forEach((testCase, index) => {
  const result = isValidDistribution(testCase.input);
  const status = result === testCase.expected ? "✅ PASS" : "❌ FAIL";

  if (result === testCase.expected) {
    passed++;
  } else {
    failed++;
    console.log(
      `${status} [${index + 1}/${testCases.length}] ${testCase.name}`,
      `\n   Expected: ${testCase.expected}, Got: ${result}`,
      `\n   Input: ${JSON.stringify(testCase.input)}\n`
    );
  }
});

console.log("\n=== Distribution Mismatch Scenarios ===\n");

// Scenario 1: Exact match
console.log("Scenario 1: 3 targets with [75, 15, 10]");
const dist1 = [75, 15, 10];
console.log(`  Distribution: ${dist1.join(", ")}%`);
console.log(`  Expected: Use as-is ✅\n`);

// Scenario 2: Fewer targets than distribution
console.log("Scenario 2: 2 targets with [75, 15, 10]");
const dist2 = [75, 15, 10];
const sliced = dist2.slice(0, 2); // [75, 15]
const sum = sliced.reduce((a, b) => a + b, 0);
const normalized = sliced.map((pct) => (pct / sum) * 100);
console.log(`  Original: ${dist2.join(", ")}%`);
console.log(`  Sliced: ${sliced.join(", ")}% (sum=${sum}%)`);
console.log(`  Normalized: ${normalized.map((d) => d.toFixed(2)).join(", ")}% ✅\n`);

// Scenario 3: More targets than distribution
console.log("Scenario 3: 5 targets with [75, 15, 10]");
const dist3 = [75, 15, 10];
const targets = 5;
const equalDist = Array(targets).fill(100 / targets);
console.log(`  Original: ${dist3.join(", ")}%`);
console.log(`  Equal distribution: ${equalDist.map((d) => d.toFixed(2)).join(", ")}% ✅\n`);

// Scenario 4: Edge case - single target
console.log("Scenario 4: 1 target with [75, 15, 10]");
const dist4 = [75, 15, 10];
const sliced4 = dist4.slice(0, 1); // [75]
const sum4 = sliced4.reduce((a, b) => a + b, 0);
const normalized4 = sliced4.map((pct) => (pct / sum4) * 100);
console.log(`  Original: ${dist4.join(", ")}%`);
console.log(`  Sliced: ${sliced4.join(", ")}% (sum=${sum4}%)`);
console.log(`  Normalized: ${normalized4.join(", ")}% ✅\n`);

console.log("\n=== Test Summary ===");
console.log(`Total: ${testCases.length}`);
console.log(`✅ Passed: ${passed}`);
console.log(`❌ Failed: ${failed}`);
console.log(`Success rate: ${((passed / testCases.length) * 100).toFixed(1)}%\n`);

if (failed === 0) {
  console.log("🎉 All tests passed!");
  process.exit(0);
} else {
  console.log(`⚠️  ${failed} test(s) failed`);
  process.exit(1);
}
