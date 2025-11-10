import { ParsedSignal } from "@/types";
import {
  SYMBOL_PATTERN,
  ENTRY_PATTERNS,
  SECOND_ENTRY_PATTERN,
  CMP_PATTERN,
  TARGETS_PATTERNS,
  STOP_LOSS_PATTERNS,
  extractNumbers,
  extractPercentages,
  isPercentageTargets,
} from "./patterns";
import {
  normalizeSymbol,
  normalizeEntries,
  normalizeTargets,
  normalizeStopLoss,
  calculateTargetsFromPercentages,
  deduplicateArray,
  cleanSignalText,
} from "./normalizers";
import { validateParsedSignal, calculateConfidence } from "./validators";

export function parseSignal(rawSignal: string): ParsedSignal {
  const cleanedSignal = cleanSignalText(rawSignal);
  const errors: string[] = [];

  let symbol = "";
  let entries: number[] = [];
  let targets: number[] = [];
  let stopLoss = 0;
  let currentMarketPrice: number | undefined = undefined;

  const symbolMatch = cleanedSignal.match(SYMBOL_PATTERN);
  if (symbolMatch) {
    symbol = normalizeSymbol(symbolMatch[1]);
  } else {
    errors.push("Could not extract symbol");
  }

  for (const pattern of ENTRY_PATTERNS) {
    const entryMatch = cleanedSignal.match(pattern);
    if (entryMatch) {
      if (entryMatch[2]) {
        entries.push(parseFloat(entryMatch[1]));
        entries.push(parseFloat(entryMatch[2]));
      } else {
        entries.push(parseFloat(entryMatch[1]));
      }
      break;
    }
  }

  const secondEntryMatch = cleanedSignal.match(SECOND_ENTRY_PATTERN);
  if (secondEntryMatch) {
    entries.push(parseFloat(secondEntryMatch[1]));
  }

  if (entries.length === 0) {
    errors.push("Could not extract entry prices");
  }

  const cmpMatch = cleanedSignal.match(CMP_PATTERN);
  if (cmpMatch) {
    currentMarketPrice = parseFloat(cmpMatch[1]);
  }

  for (const pattern of TARGETS_PATTERNS) {
    const targetsMatch = cleanedSignal.match(pattern);
    if (targetsMatch) {
      const targetsText = targetsMatch[1];

      if (isPercentageTargets(targetsText)) {
        const percentages = extractPercentages(targetsText);
        if (percentages.length > 0) {
          const basePrice = currentMarketPrice || Math.max(...entries);
          targets = calculateTargetsFromPercentages(percentages, basePrice);
        }
      } else {
        targets = extractNumbers(targetsText);
      }
      break;
    }
  }

  if (targets.length === 0) {
    errors.push("Could not extract target prices");
  }

  for (const pattern of STOP_LOSS_PATTERNS) {
    const slMatch = cleanedSignal.match(pattern);
    if (slMatch) {
      stopLoss = parseFloat(slMatch[1]);
      break;
    }
  }

  if (stopLoss === 0) {
    errors.push("Could not extract stop loss");
  }

  entries = deduplicateArray(normalizeEntries(entries));
  targets = deduplicateArray(normalizeTargets(targets, entries));
  stopLoss = normalizeStopLoss(stopLoss, entries);

  const parsed: ParsedSignal = {
    symbol,
    entries,
    targets,
    stopLoss,
    currentMarketPrice,
    confidence: 0,
    errors,
  };

  const validation = validateParsedSignal(parsed);
  parsed.errors.push(...validation.errors);

  parsed.confidence = calculateConfidence(
    parsed,
    !!symbol,
    entries.length > 0,
    targets.length > 0,
    stopLoss > 0
  );

  return parsed;
}
