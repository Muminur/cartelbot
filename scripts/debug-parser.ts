// Debug script to test parser patterns
// This helps identify parsing issues

// Test 1: Symbol extraction
const SYMBOL_PATTERN = /(?:Buying\s+)?[\$\s]*([A-Z]{2,10})(?:\s+Buying)?/i;

const testSymbols = [
  "Buying $Mln",
  "$RAD",
  "$NEAR Buying Now:",
  "$ROSE Buying Now",
];

console.log("SYMBOL PATTERN TESTS:");
console.log("=".repeat(60));
testSymbols.forEach((text) => {
  const match = text.match(SYMBOL_PATTERN);
  console.log(`Input: "${text}"`);
  console.log(`Match: ${match ? match[1] : "NO MATCH"}`);
  console.log();
});

// Test 2: Entry patterns
const ENTRY_PATTERNS = [
  /(?:First\s+buying|Entry):\s*([0-9.]+)\s*[-–—]\s*([0-9.]+)/i,
  /(?:First\s+buying|Entry):\s*([0-9.]+)/i,
];

const testEntries = [
  "First buying: 6.28 – 6.31",
  "Entry: 2.270 - 2.124",
  "First buying: 0.00824 – 0.00829",
];

console.log("ENTRY PATTERN TESTS:");
console.log("=".repeat(60));
testEntries.forEach((text) => {
  for (const pattern of ENTRY_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      console.log(`Input: "${text}"`);
      console.log(`Match: ${match[1]}${match[2] ? " - " + match[2] : ""}`);
      console.log();
      break;
    }
  }
});

// Test 3: Targets patterns
const TARGETS_PATTERNS = [
  /Targets?:\s*([0-9.,\s%]+)/is,
  /Targets?\s+([0-9.,\s%]+)/is,
];

const testTargets = [
  `Targets:
4%
8%
12%`,
  `Targets:
2.370
2.510`,
  `Targets
0.00857
0.00893`,
];

console.log("TARGETS PATTERN TESTS:");
console.log("=".repeat(60));
testTargets.forEach((text) => {
  for (const pattern of TARGETS_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      console.log(`Input: "${text.replace(/\n/g, "\\n")}"`);
      console.log(`Match: "${match[1].replace(/\n/g, "\\n")}"`);
      console.log();
      break;
    }
  }
});

// Test 4: Number extraction
const NUMBER_PATTERN = /[0-9.]+/g;
const PERCENTAGE_PATTERN = /([0-9]+(?:\.[0-9]+)?)%/g;

const testNumbers = [
  "4%, 8%, 12%",
  "2.370, 2.510, 2.690",
  "0.00857\\n0.00893\\n0.00925",
];

console.log("NUMBER EXTRACTION TESTS:");
console.log("=".repeat(60));
testNumbers.forEach((text) => {
  const numbers = text.match(NUMBER_PATTERN);
  const percentages = Array.from(text.matchAll(PERCENTAGE_PATTERN));
  console.log(`Input: "${text}"`);
  console.log(`Numbers: ${numbers ? numbers.join(", ") : "NONE"}`);
  console.log(
    `Percentages: ${percentages.length > 0 ? percentages.map((m) => m[1]).join(", ") : "NONE"}`
  );
  console.log();
});

// Test 5: Full signal parsing simulation
console.log("FULL SIGNAL PARSING SIMULATION:");
console.log("=".repeat(60));

const pondSignal = `Buying $Pond
First buying: 0.00824 – 0.00829
Second buying: 0.00780
CMP: 0.00825
Targets
0.00857
0.00893
0.00925
0.00990
0.01075
Sl: 0.00740`;

console.log("Signal:", pondSignal.replace(/\n/g, "\\n"));
console.log();

// Check targets pattern matching
console.log("Testing targets extraction:");
for (let i = 0; i < TARGETS_PATTERNS.length; i++) {
  const match = pondSignal.match(TARGETS_PATTERNS[i]);
  if (match) {
    console.log(`Pattern ${i + 1} matched!`);
    console.log(`Captured: "${match[1].replace(/\n/g, "\\n")}"`);
    const numbers = match[1].match(NUMBER_PATTERN);
    console.log(`Extracted numbers: ${numbers ? numbers.join(", ") : "NONE"}`);
    break;
  }
}
