export const SYMBOL_PATTERN = /(?:Buying\s+)?\$\s*([A-Z]{2,10})(?:\s+Buying)?/i;

export const ENTRY_PATTERNS = [
  /(?:First\s+buying|Entry):\s*([0-9.]+)\s*[-–—]\s*([0-9.]+)/i,
  /(?:First\s+buying|Entry):\s*([0-9.]+)/i,
];

export const SECOND_ENTRY_PATTERN = /Second\s+buying:\s*([0-9.]+)/i;

export const CMP_PATTERN = /CMP:\s*([0-9.]+)/i;

export const TARGETS_PATTERNS = [
  /Targets?:\s*([0-9.,\s%]+)/is,
  /Targets?\s+([0-9.,\s%]+)/is,
];

export const STOP_LOSS_PATTERNS = [
  /S[LlIi]:\s*([0-9.]+)/i, // Handle OCR misreading L as I
  /Stop\s*[Ll]oss:\s*([0-9.]+)/i,
];

export const NUMBER_PATTERN = /[0-9.]+/g;

export const PERCENTAGE_PATTERN = /([0-9]+(?:\.[0-9]+)?)%/g;

export function extractNumbers(text: string): number[] {
  const matches = text.match(NUMBER_PATTERN);
  if (!matches) return [];
  return matches.map((n) => parseFloat(n)).filter((n) => !isNaN(n) && n > 0 && isFinite(n));
}

export function extractPercentages(text: string): number[] {
  // CRITICAL FIX: Reset lastIndex to prevent skipping matches after isPercentageTargets() call
  // The global /g flag makes PERCENTAGE_PATTERN stateful - .test() modifies lastIndex
  PERCENTAGE_PATTERN.lastIndex = 0;
  const matches = Array.from(text.matchAll(PERCENTAGE_PATTERN));
  if (!matches.length) return [];
  return matches
    .map((m) => parseFloat(m[1]))
    .filter((n) => !isNaN(n) && n > 0 && n <= 1000 && isFinite(n));
}

export function isPercentageTargets(text: string): boolean {
  // CRITICAL FIX: Reset lastIndex before test to ensure consistent behavior
  // Without this, consecutive calls would produce inconsistent results
  PERCENTAGE_PATTERN.lastIndex = 0;
  return PERCENTAGE_PATTERN.test(text);
}
