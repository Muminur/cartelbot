import { ValidationError } from "@/lib/utils/errors";

export type PositionSizingMethod = "fixed" | "percentage" | "risk_based";

export interface PositionSizeParams {
  method: PositionSizingMethod;
  fixedAmount?: number;
  percentage?: number;
  riskPercent?: number;
  balance?: number;
  entryPrice?: number;
  stopLoss?: number;
  maxPositionSize?: number;
}

export interface PositionSizeResult {
  amount: number;
  method: PositionSizingMethod;
  balance?: number;
  calculatedRisk?: number;
}

export function calculateFixedAmount(amount: number): PositionSizeResult {
  if (amount <= 0) {
    throw new ValidationError("Fixed amount must be greater than 0");
  }

  if (amount < 10) {
    throw new ValidationError("Minimum position size is 10 USDT");
  }

  if (amount > 100000) {
    throw new ValidationError("Maximum position size is 100,000 USDT");
  }

  return {
    amount,
    method: "fixed",
  };
}

export function calculatePercentageOfBalance(
  percentage: number,
  balance: number
): PositionSizeResult {
  if (percentage <= 0 || percentage > 100) {
    throw new ValidationError("Percentage must be between 0 and 100");
  }

  if (balance <= 0) {
    throw new ValidationError("Balance must be greater than 0");
  }

  const amount = (balance * percentage) / 100;

  if (amount < 10) {
    throw new ValidationError(
      `Calculated amount (${amount.toFixed(2)} USDT) is below minimum position size of 10 USDT`
    );
  }

  if (amount > 100000) {
    throw new ValidationError(
      `Calculated amount (${amount.toFixed(2)} USDT) exceeds maximum position size of 100,000 USDT`
    );
  }

  return {
    amount,
    method: "percentage",
    balance,
  };
}

export function calculateRiskBasedSize(
  riskPercent: number,
  balance: number,
  entryPrice: number,
  stopLoss: number
): PositionSizeResult {
  if (riskPercent <= 0 || riskPercent > 10) {
    throw new ValidationError("Risk percentage must be between 0 and 10");
  }

  if (balance <= 0) {
    throw new ValidationError("Balance must be greater than 0");
  }

  if (entryPrice <= 0) {
    throw new ValidationError("Entry price must be greater than 0");
  }

  if (stopLoss <= 0) {
    throw new ValidationError("Stop loss must be greater than 0");
  }

  if (stopLoss >= entryPrice) {
    throw new ValidationError("Stop loss must be below entry price");
  }

  const riskAmount = (balance * riskPercent) / 100;
  const priceRisk = entryPrice - stopLoss;
  const priceRiskPercent = (priceRisk / entryPrice) * 100;

  const amount = (riskAmount / priceRiskPercent) * 100;

  if (amount < 10) {
    throw new ValidationError(
      `Calculated amount (${amount.toFixed(2)} USDT) is below minimum position size of 10 USDT. Try increasing risk percentage.`
    );
  }

  if (amount > 100000) {
    throw new ValidationError(
      `Calculated amount (${amount.toFixed(2)} USDT) exceeds maximum position size of 100,000 USDT. Try reducing risk percentage.`
    );
  }

  return {
    amount,
    method: "risk_based",
    balance,
    calculatedRisk: riskAmount,
  };
}

export function validatePositionSize(
  amount: number,
  maxPosition: number,
  balance: number
): { isValid: boolean; error?: string } {
  if (amount <= 0) {
    return { isValid: false, error: "Position size must be greater than 0" };
  }

  if (amount < 10) {
    return { isValid: false, error: "Position size must be at least 10 USDT" };
  }

  if (amount > maxPosition) {
    return {
      isValid: false,
      error: `Position size (${amount.toFixed(2)} USDT) exceeds maximum allowed (${maxPosition} USDT)`,
    };
  }

  if (amount > balance) {
    return {
      isValid: false,
      error: `Position size (${amount.toFixed(2)} USDT) exceeds available balance (${balance.toFixed(2)} USDT)`,
    };
  }

  return { isValid: true };
}

export function calculatePositionSize(params: PositionSizeParams): PositionSizeResult {
  const { method, fixedAmount, percentage, riskPercent, balance, entryPrice, stopLoss, maxPositionSize } = params;

  let result: PositionSizeResult;

  switch (method) {
    case "fixed":
      if (!fixedAmount) {
        throw new ValidationError("Fixed amount is required for fixed position sizing");
      }
      result = calculateFixedAmount(fixedAmount);
      break;

    case "percentage":
      if (!percentage || !balance) {
        throw new ValidationError("Percentage and balance are required for percentage-based position sizing");
      }
      result = calculatePercentageOfBalance(percentage, balance);
      break;

    case "risk_based":
      if (!riskPercent || !balance || !entryPrice || !stopLoss) {
        throw new ValidationError(
          "Risk percentage, balance, entry price, and stop loss are required for risk-based position sizing"
        );
      }
      result = calculateRiskBasedSize(riskPercent, balance, entryPrice, stopLoss);
      break;

    default:
      throw new ValidationError(`Invalid position sizing method: ${method}`);
  }

  if (maxPositionSize && result.amount > maxPositionSize) {
    throw new ValidationError(
      `Calculated position size (${result.amount.toFixed(2)} USDT) exceeds maximum allowed (${maxPositionSize} USDT)`
    );
  }

  return result;
}
