import { ParsedSignal } from "@/types";

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

export function validateParsedSignal(signal: ParsedSignal): ValidationResult {
  const errors: string[] = [];

  if (!signal.symbol) {
    errors.push("Missing symbol");
  }

  if (!signal.entries || signal.entries.length === 0) {
    errors.push("No entry prices found");
  }

  if (!signal.targets || signal.targets.length === 0) {
    errors.push("No target prices found");
  }

  if (!signal.stopLoss || signal.stopLoss <= 0) {
    errors.push("Missing or invalid stop loss");
  }

  if (signal.entries.length > 0 && signal.stopLoss > 0) {
    const minEntry = Math.min(...signal.entries);
    if (signal.stopLoss >= minEntry) {
      errors.push("Stop loss must be below entry prices");
    }
  }

  if (signal.entries.length > 0 && signal.targets.length > 0) {
    const maxEntry = Math.max(...signal.entries);
    const minTarget = Math.min(...signal.targets);
    if (minTarget <= maxEntry) {
      errors.push("Targets must be above entry prices");
    }
  }

  if (signal.targets.length > 10) {
    errors.push("Too many targets (maximum 10)");
  }

  if (signal.entries.length > 5) {
    errors.push("Too many entry prices (maximum 5)");
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

export function calculateConfidence(
  signal: ParsedSignal,
  hasSymbol: boolean,
  hasEntries: boolean,
  hasTargets: boolean,
  hasStopLoss: boolean
): number {
  let confidence = 0;

  if (hasSymbol) confidence += 25;
  if (hasEntries) confidence += 25;
  if (hasTargets) confidence += 25;
  if (hasStopLoss) confidence += 25;

  if (signal.currentMarketPrice) confidence += 5;
  if (signal.entries.length > 1) confidence += 5;
  if (signal.targets.length >= 3) confidence += 5;

  return Math.min(confidence, 100);
}
