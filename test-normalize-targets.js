// Test normalizeTargets function
function normalizeTargets(targets, entries) {
  if (entries.length === 0) return [];
  const maxEntry = Math.max(...entries);
  console.log("Max entry:", maxEntry);
  console.log("Targets before filter:", targets);
  
  const filtered = targets.filter((t) => t > maxEntry && isFinite(t));
  console.log("Targets after filter (> maxEntry):", filtered);
  
  return filtered.sort((a, b) => a - b);
}

// Test with actual values
const entries = [3213, 3212]; // First buying: 3212, Second buying: 3213
const targets = [3341.52, 3470.04, 3598.56, 3855.6, 4176.9]; // All 5 percentage targets

console.log("=== Testing normalizeTargets ===");
const result = normalizeTargets(targets, entries);
console.log("Final result:", result);
console.log("Count:", result.length);
