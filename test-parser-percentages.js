// Test the parser with the exact signal
const signal = `Buying $ETH
First buying: 3212
Second buying: 3213
CMP: 3213
Targets:
4%
8%
12%
20%
30%
Sl: 3200`;

console.log("Signal text:");
console.log(signal);
console.log("\n=== Testing percentage extraction ===");

// Extract percentages
const percentageRegex = /(\d+(?:\.\d+)?)\s*%/g;
const percentages = [];
let match;
while ((match = percentageRegex.exec(signal)) !== null) {
  percentages.push(parseFloat(match[1]));
}

console.log("Extracted percentages:", percentages);
console.log("Count:", percentages.length);

// Calculate targets from CMP 3213
const CMP = 3213;
console.log("\n=== Calculating targets from CMP:", CMP);
percentages.forEach((p, i) => {
  const target = CMP * (1 + p / 100);
  const rounded = Math.round(target * 100000000) / 100000000;
  console.log(`${p}%: ${target.toFixed(2)} (rounded: ${rounded})`);
});
