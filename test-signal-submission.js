/**
 * Test Script: Signal Submission Flow
 *
 * This script tests the complete signal submission flow:
 * 1. Parse signal text
 * 2. Submit parsed signal
 * 3. Verify signal created in database
 */

const testSignals = {
  valid1: `Buying $MLN
First buying: 6.28 – 6.31
Targets: 4%, 8%, 12%, 20%, 30%
Sl: 5.69`,

  valid2: `$NEAR Buying Now:
Entry: 2.270 - 2.124
Targets: 2.370, 2.510, 2.690, 2.820
SL: 2.050`,

  valid3: `Buying $RAD
First buying: 0.677 – 0.68
Second buying: 0.637
CMP: 0.678
Targets: 0.704, 0.730, 0.760, 0.814, 0.880
Sl: 0.605`,

  invalid: `Buy some coin
No proper format`,
};

console.log("Signal Submission Test Script");
console.log("=".repeat(60));
console.log("\nTest Signals:");
console.log("-".repeat(60));

Object.entries(testSignals).forEach(([name, signal]) => {
  console.log(`\n${name.toUpperCase()}:`);
  console.log(signal);
  console.log("-".repeat(60));
});

console.log("\n\nTO TEST:");
console.log("1. Start the dev server: npm run dev");
console.log("2. Login to the application");
console.log("3. Go to /signals page");
console.log("4. Paste one of the signals above into the text area");
console.log("5. Click 'Parse & Review'");
console.log("6. Check the parsed output");
console.log("7. Click 'Confirm & Submit'");
console.log("8. Check the console logs in the terminal for detailed logging");
console.log("\nExpected Console Output:");
console.log("-".repeat(60));
console.log("POST /api/signals - Request received: { userId: '...', isImageSignal: false, ... }");
console.log("POST /api/signals - Parsed signal: { symbol: 'MLNUSDT', entries: [6.31, 6.28], ... }");
console.log("POST /api/signals - Creating signal document: { ... }");
console.log("\nIf you see a validation error, it will show:");
console.log("POST /api/signals - Validation failed: { validationErrors: [...], ... }");
console.log("MongoDB Validation Error Details: { ... }");
console.log("-".repeat(60));
console.log("\n\nPARSED SIGNAL STRUCTURE EXPECTED:");
console.log("-".repeat(60));
console.log(JSON.stringify({
  symbol: "MLNUSDT",
  entries: [6.31, 6.28],
  targets: [6.54, 6.78, 7.03, 7.54, 8.18],
  stopLoss: 5.69,
  currentMarketPrice: undefined,
  confidence: 100,
  errors: [],
}, null, 2));
console.log("-".repeat(60));
