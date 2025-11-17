import { parseSymbolToUsdt } from "@/lib/utils/format";

export function normalizeSymbol(symbol: string): string {
  return parseSymbolToUsdt(symbol);
}

export function normalizeEntries(entries: number[]): number[] {
  return entries
    .filter((e) => e > 0 && isFinite(e))
    .sort((a, b) => b - a);
}

export function normalizeTargets(targets: number[], entries: number[]): number[] {
  if (entries.length === 0) return [];
  const maxEntry = Math.max(...entries);
  return targets
    .filter((t) => t > maxEntry && isFinite(t))
    .sort((a, b) => a - b);
}

export function normalizeStopLoss(stopLoss: number, entries: number[]): number {
  if (entries.length === 0 || stopLoss <= 0) {
    return stopLoss;
  }

  const minEntry = Math.min(...entries);
  const maxEntry = Math.max(...entries);

  // If stop loss is already valid (below minEntry), return as-is
  if (stopLoss < minEntry) {
    return stopLoss;
  }

  // Stop loss is invalid (>= minEntry). Try to normalize decimal precision.

  // Strategy 1: Detect average decimal places in entries
  const entryDecimalPlaces = entries.map((entry) => {
    const str = entry.toString();
    const decimalIndex = str.indexOf(".");
    return decimalIndex === -1 ? 0 : str.length - decimalIndex - 1;
  });
  const avgDecimalPlaces = Math.round(
    entryDecimalPlaces.reduce((sum, dp) => sum + dp, 0) / entryDecimalPlaces.length
  );

  // Strategy 2: Try dividing by powers of 10 to find valid stop loss
  // Example: 1880 / 1000 = 1.880 → 0.01880 (divide by 100000)
  for (let power = 1; power <= 8; power++) {
    const divisor = Math.pow(10, power);
    const normalizedSL = stopLoss / divisor;

    // Check if this normalized value is now valid (below minEntry)
    if (normalizedSL < minEntry && normalizedSL > 0) {
      // Additional validation: ensure it's not TOO far below (should be within 50% of minEntry)
      const percentBelow = ((minEntry - normalizedSL) / minEntry) * 100;

      // Typical stop loss is 5-20% below entry
      // Allow up to 50% to be flexible, but prevent 1880 → 0.001880 (99.9% below)
      if (percentBelow <= 50) {
        return normalizedSL;
      }
    }
  }

  // Strategy 3: Handle specific pattern like "01880" (missing "0." prefix)
  // If stopLoss looks like it starts with "0" followed by digits (e.g., 1880 from "01880")
  // Try prepending "0." - convert 1880 → 0.01880
  const stopLossStr = stopLoss.toString();
  if (stopLossStr.indexOf(".") === -1) {
    // No decimal point
    // Try creating "0." + original input
    // Example: "01880" becomes 1880 (number), try 0.01880
    const withDecimal = parseFloat("0.0" + stopLossStr);
    if (withDecimal < minEntry && withDecimal > 0) {
      const percentBelow = ((minEntry - withDecimal) / minEntry) * 100;
      if (percentBelow <= 50) {
        return withDecimal;
      }
    }
  }

  // Strategy 4: Use entry decimal places as reference
  // If entries have 5 decimal places (e.g., 0.01882), and SL has 0 decimals (1880),
  // try shifting decimal to match entry precision
  if (avgDecimalPlaces >= 4 && stopLossStr.indexOf(".") === -1) {
    // Entries are in small decimals (like 0.01882), SL is whole number
    // Shift decimal left by avgDecimalPlaces
    const shifted = stopLoss / Math.pow(10, avgDecimalPlaces);
    if (shifted < minEntry && shifted > 0) {
      const percentBelow = ((minEntry - shifted) / minEntry) * 100;
      if (percentBelow <= 50) {
        return shifted;
      }
    }
  }

  // If all normalization strategies fail, return original value
  // Validation will catch this and add error message
  return stopLoss;
}

export function calculateTargetsFromPercentages(
  percentages: number[],
  basePrice: number
): number[] {
  return percentages.map((p) => {
    const target = basePrice * (1 + p / 100);
    return Math.round(target * 100000000) / 100000000;
  });
}

export function deduplicateArray(arr: number[]): number[] {
  return Array.from(new Set(arr));
}

export function cleanSignalText(text: string): string {
  return text
    .trim()
    .replace(/\r\n/g, "\n")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/[^\S\n]+/g, " ")
    .replace(/\n{3,}/g, "\n\n");
}
