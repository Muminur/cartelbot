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

export function normalizeStopLoss(stopLoss: number, _entries: number[]): number {
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
