import { connectDB } from "@/lib/db";
import { Trade, User } from "@/lib/db/models";
import { Types } from "mongoose";
import { ValidationError } from "@/lib/utils/errors";

export interface RiskLimits {
  maxPositionSize: number;
  maxDailyLoss: number;
  maxOpenPositions: number;
  requireApproval: boolean;
  maxTargets: number;
  targetDistribution: number[];
}

export interface RiskCheckParams {
  userId: Types.ObjectId | string;
  positionSize: number;
  symbol?: string;
}

export interface RiskCheckResult {
  allowed: boolean;
  reason?: string;
  currentDailyLoss?: number;
  currentOpenPositions?: number;
  emergencyStopActive?: boolean;
}

const DEFAULT_RISK_LIMITS: RiskLimits = {
  maxPositionSize: 10000,
  maxDailyLoss: 1000,
  maxOpenPositions: 10,
  requireApproval: false,
  maxTargets: 3,
  targetDistribution: [75, 15, 10],
};

/**
 * Validates if target distribution array is valid
 * @param distribution - Array of percentage values
 * @returns true if valid, false otherwise
 */
export function isValidDistribution(distribution: number[] | undefined | null): boolean {
  if (!distribution || !Array.isArray(distribution)) {
    console.warn("[Risk Manager] Invalid distribution: not an array");
    return false;
  }

  if (distribution.length < 1 || distribution.length > 5) {
    console.warn(
      `[Risk Manager] Invalid distribution: length ${distribution.length} (must be 1-5)`
    );
    return false;
  }

  // Check each value is valid percentage
  for (let i = 0; i < distribution.length; i++) {
    const value = distribution[i];
    if (typeof value !== "number" || isNaN(value)) {
      console.warn(
        `[Risk Manager] Invalid distribution: value at index ${i} is not a number (${typeof value})`
      );
      return false;
    }

    if (value < 0 || value > 100) {
      console.warn(
        `[Risk Manager] Invalid distribution: value at index ${i} is ${value} (must be 0-100)`
      );
      return false;
    }
  }

  // Check sum equals 100% (with 0.01 tolerance for floating point)
  const sum = distribution.reduce((a, b) => a + b, 0);
  const tolerance = 0.01;
  if (Math.abs(sum - 100) > tolerance) {
    console.warn(
      `[Risk Manager] Invalid distribution: sum is ${sum.toFixed(2)}% (must be 100%)`
    );
    return false;
  }

  return true;
}

export async function getUserRiskLimits(userId: Types.ObjectId | string): Promise<RiskLimits> {
  await connectDB();

  const userIdStr = userId instanceof Types.ObjectId ? userId.toString() : userId;
  const user = await User.findById(userIdStr).lean();

  if (!user) {
    throw new ValidationError("User not found");
  }

  const userDoc = user as unknown as {
    maxPositionSize?: number;
    maxDailyLoss?: number;
    maxOpenPositions?: number;
    requireApproval?: boolean;
    maxTargets?: number;
    targetDistribution?: number[];
  };

  // CRITICAL: Validate target distribution before using
  let targetDistribution = userDoc.targetDistribution;
  const maxTargets = userDoc.maxTargets ?? DEFAULT_RISK_LIMITS.maxTargets;

  if (targetDistribution && !isValidDistribution(targetDistribution)) {
    console.warn(
      `[Risk Manager] User ${userIdStr} has invalid targetDistribution: ` +
      `${JSON.stringify(targetDistribution)}. Falling back to default: ${DEFAULT_RISK_LIMITS.targetDistribution.join(", ")}`
    );
    targetDistribution = undefined; // Force fallback to default
  }

  // Ensure targetDistribution length matches maxTargets
  if (targetDistribution && targetDistribution.length !== maxTargets) {
    console.warn(
      `[Risk Manager] User ${userIdStr} targetDistribution length (${targetDistribution.length}) ` +
      `doesn't match maxTargets (${maxTargets}). Adjusting...`
    );

    if (targetDistribution.length > maxTargets) {
      // Trim and normalize
      const trimmed = targetDistribution.slice(0, maxTargets);
      const sum = trimmed.reduce((a, b) => a + b, 0);
      targetDistribution = trimmed.map(v => (v / sum) * 100);
    } else {
      // Pad with equal distribution
      const equalPercentage = 100 / maxTargets;
      targetDistribution = Array(maxTargets).fill(equalPercentage);
    }
  }

  return {
    maxPositionSize: userDoc.maxPositionSize ?? DEFAULT_RISK_LIMITS.maxPositionSize,
    maxDailyLoss: userDoc.maxDailyLoss ?? DEFAULT_RISK_LIMITS.maxDailyLoss,
    maxOpenPositions: userDoc.maxOpenPositions ?? DEFAULT_RISK_LIMITS.maxOpenPositions,
    requireApproval: userDoc.requireApproval ?? DEFAULT_RISK_LIMITS.requireApproval,
    maxTargets: maxTargets,
    targetDistribution: targetDistribution ?? DEFAULT_RISK_LIMITS.targetDistribution,
  };
}

export async function checkDailyLossLimit(
  userId: Types.ObjectId | string,
  maxLoss: number
): Promise<{ exceeded: boolean; currentLoss: number }> {
  await connectDB();

  const userIdStr = userId instanceof Types.ObjectId ? userId.toString() : userId;
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const trades = await Trade.find({
    userId: userIdStr,
    createdAt: { $gte: startOfDay },
    status: { $in: ["closed", "cancelled"] },
    realizedPnL: { $exists: true, $lt: 0 },
  }).lean();

  const currentLoss = trades.reduce((sum, trade) => {
    const pnl = trade.realizedPnL || 0;
    return sum + Math.abs(pnl);
  }, 0);

  return {
    exceeded: currentLoss >= maxLoss,
    currentLoss,
  };
}

export async function checkMaxPositionSize(
  positionSize: number,
  maxSize: number
): Promise<{ exceeded: boolean; maxSize: number }> {
  return {
    exceeded: positionSize > maxSize,
    maxSize,
  };
}

export async function checkMaxOpenPositions(
  userId: Types.ObjectId | string,
  maxPositions: number
): Promise<{ exceeded: boolean; currentPositions: number; maxPositions: number }> {
  await connectDB();

  const userIdStr = userId instanceof Types.ObjectId ? userId.toString() : userId;

  const openTrades = await Trade.countDocuments({
    userId: userIdStr,
    status: { $in: ["open", "partial"] },
  });

  return {
    exceeded: openTrades >= maxPositions,
    currentPositions: openTrades,
    maxPositions,
  };
}

export async function validateTradeRisk(params: RiskCheckParams): Promise<RiskCheckResult> {
  const { userId, positionSize } = params;

  const userIdStr = userId instanceof Types.ObjectId ? userId.toString() : userId;

  const emergencyStopStatus = await getEmergencyStopStatus(userIdStr);
  if (emergencyStopStatus) {
    return {
      allowed: false,
      reason: "Emergency stop is active. All trading is disabled.",
      emergencyStopActive: true,
    };
  }

  const riskLimits = await getUserRiskLimits(userIdStr);

  const positionCheck = await checkMaxPositionSize(positionSize, riskLimits.maxPositionSize);
  if (positionCheck.exceeded) {
    return {
      allowed: false,
      reason: `Position size (${positionSize.toFixed(2)} USDT) exceeds maximum allowed (${riskLimits.maxPositionSize} USDT)`,
    };
  }

  const lossCheck = await checkDailyLossLimit(userIdStr, riskLimits.maxDailyLoss);
  if (lossCheck.exceeded) {
    return {
      allowed: false,
      reason: `Daily loss limit reached (${lossCheck.currentLoss.toFixed(2)} / ${riskLimits.maxDailyLoss} USDT)`,
      currentDailyLoss: lossCheck.currentLoss,
    };
  }

  const openPositionsCheck = await checkMaxOpenPositions(userIdStr, riskLimits.maxOpenPositions);
  if (openPositionsCheck.exceeded) {
    return {
      allowed: false,
      reason: `Maximum open positions reached (${openPositionsCheck.currentPositions} / ${riskLimits.maxOpenPositions})`,
      currentOpenPositions: openPositionsCheck.currentPositions,
    };
  }

  return {
    allowed: true,
    currentDailyLoss: lossCheck.currentLoss,
    currentOpenPositions: openPositionsCheck.currentPositions,
    emergencyStopActive: false,
  };
}

export async function getEmergencyStopStatus(userId: Types.ObjectId | string): Promise<boolean> {
  await connectDB();

  const userIdStr = userId instanceof Types.ObjectId ? userId.toString() : userId;
  const user = await User.findById(userIdStr).lean();

  if (!user) {
    return false;
  }

  const userDoc = user as unknown as { emergencyStop?: boolean };
  return userDoc.emergencyStop ?? false;
}

export async function setEmergencyStop(
  userId: Types.ObjectId | string,
  active: boolean
): Promise<{ success: boolean; emergencyStop: boolean }> {
  await connectDB();

  const userIdStr = userId instanceof Types.ObjectId ? userId.toString() : userId;

  const user = await User.findByIdAndUpdate(
    userIdStr,
    { emergencyStop: active },
    { new: true }
  ).lean();

  if (!user) {
    throw new ValidationError("User not found");
  }

  return {
    success: true,
    emergencyStop: active,
  };
}

export async function updateRiskLimits(
  userId: Types.ObjectId | string,
  limits: Partial<RiskLimits>
): Promise<RiskLimits> {
  await connectDB();

  const userIdStr = userId instanceof Types.ObjectId ? userId.toString() : userId;

  if (limits.maxPositionSize !== undefined && limits.maxPositionSize < 10) {
    throw new ValidationError("Maximum position size must be at least 10 USDT");
  }

  if (limits.maxDailyLoss !== undefined && limits.maxDailyLoss < 0) {
    throw new ValidationError("Maximum daily loss must be non-negative");
  }

  if (limits.maxOpenPositions !== undefined && limits.maxOpenPositions < 1) {
    throw new ValidationError("Maximum open positions must be at least 1");
  }

  const updateFields: {
    maxPositionSize?: number;
    maxDailyLoss?: number;
    maxOpenPositions?: number;
    requireApproval?: boolean;
  } = {};
  if (limits.maxPositionSize !== undefined) updateFields.maxPositionSize = limits.maxPositionSize;
  if (limits.maxDailyLoss !== undefined) updateFields.maxDailyLoss = limits.maxDailyLoss;
  if (limits.maxOpenPositions !== undefined) updateFields.maxOpenPositions = limits.maxOpenPositions;
  if (limits.requireApproval !== undefined) updateFields.requireApproval = limits.requireApproval;

  await User.findByIdAndUpdate(userIdStr, updateFields);

  return getUserRiskLimits(userIdStr);
}
