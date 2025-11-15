/**
 * Usage Limit Middleware
 * Enforces subscription tier limits before allowing operations
 */

import { NextResponse } from "next/server";
import { canSubmitSignal } from "@/lib/subscription/usage-checker";

/**
 * Middleware to check if user can submit a signal
 * Returns NextResponse with error if limit exceeded
 */
export async function checkSignalLimit(userId: string): Promise<NextResponse | null> {
  const usageStatus = await canSubmitSignal(userId);

  if (!usageStatus.canPerformAction) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "USAGE_LIMIT_EXCEEDED",
          message: usageStatus.reason || "Usage limit exceeded",
          statusCode: 403,
          details: {
            current: usageStatus.current,
            limit: usageStatus.limit,
          },
        },
      },
      { status: 403 }
    );
  }

  return null; // No error, user can proceed
}
