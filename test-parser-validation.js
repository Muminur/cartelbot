/**
 * Parser Validation Test
 *
 * Tests the signal parser and validation logic to ensure
 * all required fields are properly validated before database insert.
 */

// Mock the parser (simplified version)
function parseSignal(rawSignal) {
  const result = {
    symbol: "",
    entries: [],
    targets: [],
    stopLoss: 0,
    currentMarketPrice: undefined,
    confidence: 0,
    errors: []
  };

  // Extract symbol (simplified)
  const symbolMatch = rawSignal.match(/\$([A-Z]{2,10})/i);
  if (symbolMatch) {
    result.symbol = symbolMatch[1].toUpperCase() + "USDT";
    result.confidence += 25;
  } else {
    result.errors.push("Could not extract symbol");
  }

  // Extract entries (simplified)
  const entryMatch = rawSignal.match(/(?:Entry|buying)[:\s]+([0-9.]+)[\s–-]+([0-9.]+)/i);
  if (entryMatch) {
    result.entries = [parseFloat(entryMatch[1]), parseFloat(entryMatch[2])].sort((a, b) => b - a);
    result.confidence += 25;
  } else {
    result.errors.push("Could not extract entry prices");
  }

  // Extract targets (simplified)
  const targetsMatch = rawSignal.match(/Targets[:\s]+([0-9.,\s%]+)/i);
  if (targetsMatch) {
    const targetsText = targetsMatch[1];
    if (targetsText.includes('%')) {
      // Percentage targets
      const percentages = targetsText.match(/([0-9]+)%/g).map(p => parseFloat(p));
      const basePrice = result.entries.length > 0 ? Math.max(...result.entries) : 0;
      result.targets = percentages.map(p => basePrice * (1 + p / 100));
    } else {
      // Price targets
      result.targets = targetsText.match(/[0-9.]+/g).map(t => parseFloat(t));
    }
    result.confidence += 25;
  } else {
    result.errors.push("Could not extract target prices");
  }

  // Extract stop loss (simplified)
  const slMatch = rawSignal.match(/(?:SL|Stop Loss)[:\s]+([0-9.]+)/i);
  if (slMatch) {
    result.stopLoss = parseFloat(slMatch[1]);
    result.confidence += 25;
  } else {
    result.errors.push("Could not extract stop loss");
  }

  return result;
}

// Mock validation function (matches the API code)
function validateParsedSignal(parsed) {
  const validationErrors = [];

  if (!parsed.symbol || !/^[A-Z]{3,10}USDT$/.test(parsed.symbol)) {
    validationErrors.push("Invalid or missing symbol");
  }

  if (!parsed.entries || parsed.entries.length === 0 || parsed.entries.some((e) => e <= 0)) {
    validationErrors.push("Invalid or missing entry prices");
  }

  if (!parsed.targets || parsed.targets.length === 0 || parsed.targets.some((t) => t <= 0)) {
    validationErrors.push("Invalid or missing target prices");
  }

  if (!parsed.stopLoss || parsed.stopLoss <= 0) {
    validationErrors.push("Invalid or missing stop loss");
  }

  return {
    isValid: validationErrors.length === 0,
    errors: validationErrors
  };
}

// Test cases
const testCases = [
  {
    name: "Valid Signal - Percentage Targets",
    signal: `Buying $MLN
First buying: 6.28 – 6.31
Targets: 4%, 8%, 12%, 20%, 30%
Sl: 5.69`,
    expectedValid: true
  },
  {
    name: "Valid Signal - Price Targets",
    signal: `$NEAR Buying Now:
Entry: 2.270 - 2.124
Targets: 2.370, 2.510, 2.690, 2.820
SL: 2.050`,
    expectedValid: true
  },
  {
    name: "Invalid Signal - Missing Symbol",
    signal: `Entry: 2.270 - 2.124
Targets: 2.370, 2.510
SL: 2.050`,
    expectedValid: false
  },
  {
    name: "Invalid Signal - Missing Entries",
    signal: `$NEAR
Targets: 2.370, 2.510
SL: 2.050`,
    expectedValid: false
  },
  {
    name: "Invalid Signal - Missing Targets",
    signal: `$NEAR Buying Now:
Entry: 2.270 - 2.124
SL: 2.050`,
    expectedValid: false
  },
  {
    name: "Invalid Signal - Missing Stop Loss",
    signal: `$NEAR Buying Now:
Entry: 2.270 - 2.124
Targets: 2.370, 2.510`,
    expectedValid: false
  },
  {
    name: "Invalid Signal - Completely Invalid",
    signal: `Buy some coin
No proper format`,
    expectedValid: false
  }
];

// Run tests
console.log("=".repeat(80));
console.log("SIGNAL PARSER VALIDATION TEST");
console.log("=".repeat(80));
console.log();

let passed = 0;
let failed = 0;

testCases.forEach((testCase, index) => {
  console.log(`Test ${index + 1}: ${testCase.name}`);
  console.log("-".repeat(80));
  console.log("Input Signal:");
  console.log(testCase.signal);
  console.log();

  const parsed = parseSignal(testCase.signal);
  const validation = validateParsedSignal(parsed);

  console.log("Parsed Result:");
  console.log(`  Symbol: ${parsed.symbol || "N/A"}`);
  console.log(`  Entries: [${parsed.entries.join(", ")}]`);
  console.log(`  Targets: [${parsed.targets.join(", ")}]`);
  console.log(`  Stop Loss: ${parsed.stopLoss || "N/A"}`);
  console.log(`  Confidence: ${parsed.confidence}%`);
  console.log(`  Parsing Errors: ${parsed.errors.length > 0 ? parsed.errors.join(", ") : "None"}`);
  console.log();

  console.log("Validation Result:");
  console.log(`  Valid: ${validation.isValid}`);
  console.log(`  Validation Errors: ${validation.errors.length > 0 ? validation.errors.join(", ") : "None"}`);
  console.log();

  const testPassed = validation.isValid === testCase.expectedValid;
  console.log(`Result: ${testPassed ? "✓ PASS" : "✗ FAIL"}`);
  console.log(`  Expected Valid: ${testCase.expectedValid}`);
  console.log(`  Actual Valid: ${validation.isValid}`);
  console.log();

  if (testPassed) {
    passed++;
  } else {
    failed++;
  }

  console.log("=".repeat(80));
  console.log();
});

console.log("TEST SUMMARY");
console.log("-".repeat(80));
console.log(`Total Tests: ${testCases.length}`);
console.log(`Passed: ${passed} ✓`);
console.log(`Failed: ${failed} ✗`);
console.log(`Success Rate: ${((passed / testCases.length) * 100).toFixed(1)}%`);
console.log("=".repeat(80));

// Exit with appropriate code
process.exit(failed === 0 ? 0 : 1);
