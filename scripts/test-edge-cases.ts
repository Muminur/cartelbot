/**
 * Edge Case Testing for Signal Parser
 * Tests boundary conditions, malformed input, and error scenarios
 */

import { parseSignal } from "../lib/parser/text-parser";
import { validateParsedSignal } from "../lib/parser/validators";

interface EdgeCaseTest {
  name: string;
  signal: string;
  expectedBehavior: string;
  shouldFail: boolean;
}

const edgeCases: EdgeCaseTest[] = [
  // Empty and Minimal Input
  {
    name: "Empty string",
    signal: "",
    expectedBehavior: "Should return low confidence with multiple errors",
    shouldFail: true,
  },
  {
    name: "Only whitespace",
    signal: "   \n\n  \t  ",
    expectedBehavior: "Should fail to extract any data",
    shouldFail: true,
  },
  {
    name: "Only symbol",
    signal: "$BTC",
    expectedBehavior: "Should extract symbol but fail validation",
    shouldFail: true,
  },

  // Invalid Symbols
  {
    name: "No symbol",
    signal: `Entry: 50000
Targets: 55000
SL: 45000`,
    expectedBehavior: "Should error: Could not extract symbol",
    shouldFail: true,
  },
  {
    name: "Single letter symbol",
    signal: `$X
Entry: 50000
Targets: 55000
SL: 45000`,
    expectedBehavior: "Should fail symbol extraction (min 2 chars)",
    shouldFail: true,
  },
  {
    name: "Symbol too long",
    signal: `$VERYLONGSYMBOLNAME
Entry: 50000
Targets: 55000
SL: 45000`,
    expectedBehavior: "Should fail symbol extraction (max 10 chars)",
    shouldFail: true,
  },

  // Missing Required Fields
  {
    name: "Missing entries",
    signal: `$BTC
Targets: 55000, 60000
SL: 45000`,
    expectedBehavior: "Should error: Could not extract entry prices",
    shouldFail: true,
  },
  {
    name: "Missing targets",
    signal: `$BTC
Entry: 50000
SL: 45000`,
    expectedBehavior: "Should error: Could not extract target prices",
    shouldFail: true,
  },
  {
    name: "Missing stop loss",
    signal: `$BTC
Entry: 50000
Targets: 55000`,
    expectedBehavior: "Should error: Could not extract stop loss",
    shouldFail: true,
  },

  // Invalid Price Relationships
  {
    name: "Stop loss above entry",
    signal: `$BTC
Entry: 50000
Targets: 55000
SL: 51000`,
    expectedBehavior: "Validation error: Stop loss must be below entry prices",
    shouldFail: true,
  },
  {
    name: "Stop loss equals entry",
    signal: `$BTC
Entry: 50000
Targets: 55000
SL: 50000`,
    expectedBehavior: "Validation error: Stop loss must be below entry prices",
    shouldFail: true,
  },
  {
    name: "Targets below entry",
    signal: `$BTC
Entry: 50000
Targets: 45000, 46000
SL: 40000`,
    expectedBehavior: "Targets filtered out, validation error",
    shouldFail: true,
  },
  {
    name: "Targets equal to entry",
    signal: `$BTC
Entry: 50000
Targets: 50000, 51000
SL: 45000`,
    expectedBehavior: "50000 target filtered out, only 51000 remains",
    shouldFail: false,
  },

  // Extreme Values
  {
    name: "Zero values",
    signal: `$BTC
Entry: 0
Targets: 0
SL: 0`,
    expectedBehavior: "All zeros filtered out, multiple errors",
    shouldFail: true,
  },
  {
    name: "Negative values",
    signal: `$BTC
Entry: -50000
Targets: -55000
SL: -45000`,
    expectedBehavior: "Negative values filtered out",
    shouldFail: true,
  },
  {
    name: "Very large numbers",
    signal: `$BTC
Entry: 999999999999
Targets: 9999999999999
SL: 999999999`,
    expectedBehavior: "Should parse correctly (no upper limit)",
    shouldFail: false,
  },
  {
    name: "Very small numbers (scientific notation)",
    signal: `$SHIB
Entry: 0.00000001
Targets: 0.00000002
SL: 0.000000005`,
    expectedBehavior: "Should parse decimal numbers correctly",
    shouldFail: false,
  },

  // Excessive Quantities
  {
    name: "Too many targets (11)",
    signal: `$BTC
Entry: 50000
Targets: 51000, 52000, 53000, 54000, 55000, 56000, 57000, 58000, 59000, 60000, 61000
SL: 45000`,
    expectedBehavior: "Validation error: Too many targets (maximum 10)",
    shouldFail: true,
  },
  {
    name: "Too many entries (6)",
    signal: `$BTC
First buying: 50000 - 51000
Second buying: 49000
Entry: 48000, 47000, 46000
Targets: 55000
SL: 45000`,
    expectedBehavior: "Validation error: Too many entry prices (maximum 5)",
    shouldFail: true,
  },

  // Percentage Edge Cases
  {
    name: "Zero percent target",
    signal: `$BTC
Entry: 50000
Targets: 0%, 5%, 10%
SL: 45000`,
    expectedBehavior: "0% filtered out, others calculated",
    shouldFail: false,
  },
  {
    name: "Negative percent",
    signal: `$BTC
Entry: 50000
Targets: -5%, 10%
SL: 45000`,
    expectedBehavior: "-5% filtered out",
    shouldFail: false,
  },
  {
    name: "Excessive percent (> 1000%)",
    signal: `$BTC
Entry: 50000
Targets: 10000%
SL: 45000`,
    expectedBehavior: "10000% filtered out (max 1000%)",
    shouldFail: true,
  },
  {
    name: "Mixed percent and absolute (should use percent)",
    signal: `$BTC
Entry: 50000
Targets: 5%, 10%, 55000
SL: 45000`,
    expectedBehavior: "Should detect as percentage and ignore 55000",
    shouldFail: false,
  },

  // Unicode and Special Characters
  {
    name: "Zero-width spaces",
    signal: `$BTC\u200B
Entry:\u200B 50000
Targets: 55000
SL: 45000`,
    expectedBehavior: "Should clean unicode and parse correctly",
    shouldFail: false,
  },
  {
    name: "Different dash types",
    signal: `$BTC
Entry: 50000-51000
Entry: 50000–51000
Entry: 50000—51000
Targets: 55000
SL: 45000`,
    expectedBehavior: "Should handle all dash types (-, –, —)",
    shouldFail: false,
  },
  {
    name: "Mixed line endings (CRLF)",
    signal: "$BTC\r\nEntry: 50000\r\nTargets: 55000\r\nSL: 45000",
    expectedBehavior: "Should normalize line endings",
    shouldFail: false,
  },

  // Malformed Formats
  {
    name: "Missing colons",
    signal: `$BTC
Entry 50000
Targets 55000
SL 45000`,
    expectedBehavior: "Should still extract with second patterns",
    shouldFail: false,
  },
  {
    name: "Case variations",
    signal: `buying $btc
ENTRY: 50000
TARGETS: 55000
sl: 45000`,
    expectedBehavior: "Case-insensitive, should parse correctly",
    shouldFail: false,
  },
  {
    name: "Extra whitespace",
    signal: `   $BTC
    Entry:     50000    -    51000
    Targets:   55000  ,  56000  ,  57000
    SL:   45000   `,
    expectedBehavior: "Should clean whitespace and parse",
    shouldFail: false,
  },

  // CMP Edge Cases
  {
    name: "CMP higher than entry",
    signal: `$BTC
Entry: 50000
CMP: 51000
Targets: 52000
SL: 45000`,
    expectedBehavior: "Should use CMP for percentage calculations",
    shouldFail: false,
  },
  {
    name: "CMP lower than entry",
    signal: `$BTC
Entry: 50000
CMP: 49000
Targets: 52000
SL: 45000`,
    expectedBehavior: "Should still parse CMP, use max entry for targets",
    shouldFail: false,
  },

  // Decimal Precision
  {
    name: "Many decimal places",
    signal: `$BTC
Entry: 50000.12345678
Targets: 55000.87654321
SL: 45000.11111111`,
    expectedBehavior: "Should preserve precision up to 8 decimals",
    shouldFail: false,
  },
  {
    name: "Trailing zeros",
    signal: `$BTC
Entry: 50000.00
Targets: 55000.00
SL: 45000.00`,
    expectedBehavior: "Should parse as whole numbers",
    shouldFail: false,
  },

  // Real-World Variations
  {
    name: "Comma as decimal separator (invalid)",
    signal: `$BTC
Entry: 50,000.00
Targets: 55,000.00
SL: 45,000.00`,
    expectedBehavior: "Comma treated as separator, will extract multiple numbers",
    shouldFail: true,
  },
  {
    name: "Mixed formats in one signal",
    signal: `$BTC
First buying: 50000
Entry: 51000 - 52000
Targets: 5%, 10%
Target: 60000
SL: 45000`,
    expectedBehavior: "Should extract all entries, first target pattern wins",
    shouldFail: false,
  },
];

function runEdgeCaseTests() {
  let passed = 0;
  let failed = 0;
  const bugs: Array<{ test: string; issue: string }> = [];

  for (const test of edgeCases) {
    try {
      const result = parseSignal(test.signal);
      const validation = validateParsedSignal(result);

      const hasCriticalErrors =
        result.errors.length > 0 || !validation.isValid || result.confidence < 50;

      if (test.shouldFail && !hasCriticalErrors) {
        failed++;
        bugs.push({
          test: test.name,
          issue: `Expected to fail but passed. Result: ${JSON.stringify(result)}`,
        });
      } else if (!test.shouldFail && hasCriticalErrors) {
        failed++;
        bugs.push({
          test: test.name,
          issue: `Expected to pass but failed. Errors: ${result.errors.join(", ")}, Validation: ${validation.errors.join(", ")}`,
        });
      } else {
        passed++;
      }
    } catch (error) {
      if (!test.shouldFail) {
        failed++;
        bugs.push({
          test: test.name,
          issue: `Unexpected exception: ${(error as Error).message}`,
        });
      } else {
        passed++;
      }
    }
  }

  return { passed, failed, total: edgeCases.length, bugs };
}

// Export for use in testing
export { runEdgeCaseTests, edgeCases };
