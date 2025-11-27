import { describe, it, expect } from 'vitest';
import { parseSignal } from "../text-parser";
import { validateParsedSignal } from "../validators";

describe("Signal Parser", () => {
  describe("Pattern 1: Percentage-based targets", () => {
    it("should parse percentage targets correctly", () => {
      const signal = `Buying $MLN
First buying: 6.28 – 6.31
Targets: 4%, 8%, 12%, 20%, 30%
Sl: 5.69`;

      const result = parseSignal(signal);

      expect(result.symbol).toBe("MLNUSDT");
      expect(result.entries).toContain(6.28);
      expect(result.entries).toContain(6.31);
      expect(result.stopLoss).toBe(5.69);
      expect(result.targets.length).toBeGreaterThan(0);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe("Pattern 2: Price-based targets", () => {
    it("should parse absolute price targets correctly", () => {
      const signal = `$NEAR Buying Now:
Entry: 2.270 - 2.124
Targets: 2.370, 2.510, 2.690, 2.820
SL: 2.050`;

      const result = parseSignal(signal);

      expect(result.symbol).toBe("NEARUSDT");
      expect(result.entries).toContain(2.27);
      expect(result.entries).toContain(2.124);
      expect(result.targets).toContain(2.37);
      expect(result.targets).toContain(2.51);
      expect(result.targets).toContain(2.69);
      expect(result.targets).toContain(2.82);
      expect(result.stopLoss).toBe(2.05);
    });
  });

  describe("Pattern 3: Mixed format with CMP", () => {
    it("should parse signal with CMP correctly", () => {
      const signal = `Buying $RAD
First buying: 0.677 – 0.68
Second buying: 0.637
CMP: 0.678
Targets: 0.704, 0.730, 0.760, 0.814, 0.880
Sl: 0.605`;

      const result = parseSignal(signal);

      expect(result.symbol).toBe("RADUSDT");
      expect(result.entries).toContain(0.677);
      expect(result.entries).toContain(0.68);
      expect(result.entries).toContain(0.637);
      expect(result.currentMarketPrice).toBe(0.678);
      expect(result.targets.length).toBe(5);
      expect(result.stopLoss).toBe(0.605);
    });
  });

  describe("Edge cases", () => {
    it("should handle invalid symbol", () => {
      const signal = `Buying
Entry: 2.270
Targets: 2.370
SL: 2.050`;

      const result = parseSignal(signal);

      expect(result.errors).toContain("Could not extract symbol");
      expect(result.confidence).toBeLessThan(100);
    });

    it("should handle missing targets", () => {
      const signal = `Buying $BTC
Entry: 50000
SL: 45000`;

      const result = parseSignal(signal);

      expect(result.errors).toContain("Could not extract target prices");
    });

    it("should handle stop loss above entry", () => {
      const signal = `Buying $BTC
Entry: 50000
Targets: 55000
SL: 51000`;

      const result = parseSignal(signal);
      const validation = validateParsedSignal(result);

      expect(validation.isValid).toBe(false);
      expect(validation.errors).toContain("Stop loss must be below entry prices");
    });

    it("should handle targets below entry", () => {
      const signal = `Buying $BTC
Entry: 50000
Targets: 45000
SL: 40000`;

      const result = parseSignal(signal);

      // normalizeTargets filters out targets below entry, resulting in empty array
      expect(result.targets.length).toBe(0);
      expect(result.errors).toContain("No target prices found");

      const validation = validateParsedSignal(result);
      expect(validation.isValid).toBe(false);
    });

    it("should handle excessive targets", () => {
      const signal = `Buying $BTC
Entry: 50000
Targets: 51000, 52000, 53000, 54000, 55000, 56000, 57000, 58000, 59000, 60000, 61000
SL: 45000`;

      const result = parseSignal(signal);
      const validation = validateParsedSignal(result);

      expect(validation.isValid).toBe(false);
      expect(validation.errors).toContain("Too many targets (maximum 10)");
    });
  });

  describe("Text cleaning", () => {
    it("should handle extra whitespace", () => {
      const signal = `Buying   $BTC
      Entry:  50000  -  51000
      Targets:  55000,  56000
      SL:  45000`;

      const result = parseSignal(signal);

      expect(result.symbol).toBe("BTCUSDT");
      expect(result.entries).toContain(50000);
      expect(result.entries).toContain(51000);
    });

    it("should handle different line endings", () => {
      const signal = "Buying $BTC\r\nEntry: 50000\r\nTargets: 55000\r\nSL: 45000";

      const result = parseSignal(signal);

      expect(result.symbol).toBe("BTCUSDT");
      expect(result.entries).toContain(50000);
    });
  });

  describe("Confidence calculation", () => {
    it("should have high confidence for complete signals", () => {
      const signal = `Buying $BTC
Entry: 50000
Targets: 55000, 60000, 65000
SL: 45000`;

      const result = parseSignal(signal);

      expect(result.confidence).toBeGreaterThanOrEqual(100);
    });

    it("should have lower confidence for incomplete signals", () => {
      const signal = `Buying $BTC
Entry: 50000`;

      const result = parseSignal(signal);

      expect(result.confidence).toBeLessThan(75);
    });
  });

  describe("Number extraction", () => {
    it("should handle decimal numbers correctly", () => {
      const signal = `Buying $BTC
Entry: 50000.5
Targets: 55000.75
SL: 45000.25`;

      const result = parseSignal(signal);

      expect(result.entries[0]).toBe(50000.5);
      expect(result.stopLoss).toBe(45000.25);
    });

    it("should filter out zero and negative numbers", () => {
      const signal = `Buying $BTC
Entry: 50000
Targets: 55000, 0, -100
SL: 45000`;

      const result = parseSignal(signal);

      expect(result.targets).not.toContain(0);
      expect(result.targets).not.toContain(-100);
    });
  });

  describe("Symbol normalization", () => {
    it("should handle various symbol formats with $ prefix", () => {
      const formats = ["$BTC", "$btc", "Buying $BTC", "$BTC  ", "  $BTC"];

      formats.forEach((format) => {
        const signal = `${format}
Entry: 50000
Targets: 55000
SL: 45000`;

        const result = parseSignal(signal);
        expect(result.symbol).toBe("BTCUSDT");
      });
    });

    it("should require $ prefix for symbol detection", () => {
      const formats = ["BTC", "btc", " BTC "];

      formats.forEach((format) => {
        const signal = `${format}
Entry: 50000
Targets: 55000
SL: 45000`;

        const result = parseSignal(signal);
        expect(result.symbol).toBe(""); // No $ = no match
        expect(result.errors).toContain("Could not extract symbol");
      });
    });

    it("should not double-add USDT", () => {
      const signal = `Buying $BTCUSDT
Entry: 50000
Targets: 55000
SL: 45000`;

      const result = parseSignal(signal);

      expect(result.symbol).toBe("BTCUSDT");
      expect(result.symbol).not.toBe("BTCUSDTUSDT");
    });
  });
});
