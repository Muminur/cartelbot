/**
 * GET /api/subscriptions/status
 * Get user's current subscription status and usage limits
 */

import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { getUserUsageStats } from "@/lib/subscription/usage-checker";

export async function GET(request: NextRequest) {
  try {
    const { user, error } = await getUserFromRequest(request);
    if (!user || error) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "UNAUTHORIZED",
            message: "Authentication required",
            statusCode: 401,
          },
        },
        { status: 401 }
      );
    }

    // Get usage statistics
    const stats = await getUserUsageStats(String(user._id));

    return NextResponse.json({
      success: true,
      data: {
        currentTier: stats.tier,
        usage: stats.usage,
        subscription: stats.subscription,
        userEmail: user.email,
      },
    });
  } catch (error) {
    console.error("Error fetching subscription status:", error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to fetch subscription status",
          statusCode: 500,
        },
      },
      { status: 500 }
    );
  }
}
