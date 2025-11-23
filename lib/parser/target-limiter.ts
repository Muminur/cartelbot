import { getUserRiskLimits } from "@/lib/binance/risk-manager";
import { Types } from "mongoose";

/**
 * Limits the number of targets from a signal based on user's maxTargets setting
 * @param targets - Array of target prices from signal
 * @param userId - User ID to get maxTargets setting
 * @returns Limited array of targets (first N targets where N = maxTargets)
 */
export async function limitSignalTargets(
  targets: number[],
  userId: Types.ObjectId | string
): Promise<number[]> {
  try {
    const riskLimits = await getUserRiskLimits(userId);
    const maxTargets = riskLimits.maxTargets;

    if (!targets || targets.length === 0) {
      console.warn("[Target Limiter] No targets provided");
      return [];
    }

    if (targets.length <= maxTargets) {
      // Signal has fewer or equal targets than maxTargets - use all
      console.log(
        `[Target Limiter] Signal has ${targets.length} targets, user maxTargets is ${maxTargets}. Using all targets.`
      );
      return targets;
    }

    // Signal has more targets than maxTargets - limit to first N
    const limitedTargets = targets.slice(0, maxTargets);
    console.log(
      `[Target Limiter] Signal has ${targets.length} targets, user maxTargets is ${maxTargets}. ` +
      `Limiting to first ${maxTargets} targets: ${limitedTargets.map(t => t.toFixed(8)).join(", ")}`
    );

    return limitedTargets;
  } catch (error) {
    console.error("[Target Limiter] Error limiting targets:", error);
    // On error, return original targets (fail-safe)
    return targets;
  }
}

/**
 * Synchronous version that doesn't fetch from database
 * Used when maxTargets is already known
 */
export function limitTargetsSync(targets: number[], maxTargets: number): number[] {
  if (!targets || targets.length === 0) {
    return [];
  }

  if (targets.length <= maxTargets) {
    return targets;
  }

  return targets.slice(0, maxTargets);
}
