import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { connectDB } from "@/lib/db/connection";
import { User } from "@/lib/db/models/User";
import { TIER_CONFIGS } from "@/lib/subscription/constants";
import { isValidDistribution } from "@/lib/binance/risk-manager";
import { z } from "zod";

const updateSettingsSchema = z.object({
  maxPositionSize: z.number().min(10).max(100000).optional(),
  maxDailyLoss: z.number().min(0).max(50000).optional(),
  maxOpenPositions: z.number().min(1).max(200).optional(),
  requireApproval: z.boolean().optional(),
  emergencyStop: z.boolean().optional(),
  useTestnet: z.boolean().optional(),
  investmentAmount: z.number().min(10).max(100000).optional(),
  targetDistribution: z.array(z.number()).length(3).optional(),
  positionSizingMethod: z.enum(["fixed", "percentage", "risk_based"]).optional(),
  riskPercentage: z.number().min(0.5).max(10).optional(),
  emailNotifications: z.object({
    onTradeExecuted: z.boolean(),
    onTargetHit: z.boolean(),
    onStopLossHit: z.boolean(),
    dailySummary: z.boolean(),
  }).optional(),
  emailFrequency: z.enum(["instant", "hourly", "daily"]).optional(),
});

export async function GET(request: NextRequest) {
  try {
    const { user, error } = await getUserFromRequest(request);
    if (error || !user) {
      return NextResponse.json(
        { success: false, error: error || "Unauthorized" },
        { status: 401 }
      );
    }

    await connectDB();

    const userDoc = await User.findOne({ email: user.email });
    if (!userDoc) {
      return NextResponse.json(
        { success: false, error: "User not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        maxPositionSize: userDoc.maxPositionSize,
        maxDailyLoss: userDoc.maxDailyLoss,
        maxOpenPositions: userDoc.maxOpenPositions,
        requireApproval: userDoc.requireApproval,
        emergencyStop: userDoc.emergencyStop,
        useTestnet: userDoc.useTestnet || false,
        investmentAmount: userDoc.investmentAmount,
        targetDistribution: userDoc.targetDistribution,
        positionSizingMethod: userDoc.positionSizingMethod,
        riskPercentage: userDoc.riskPercentage,
        emailNotifications: userDoc.emailNotifications || {
          onTradeExecuted: true,
          onTargetHit: true,
          onStopLossHit: true,
          dailySummary: false,
        },
        emailFrequency: userDoc.emailFrequency || "instant",
      },
    });
  } catch (error) {
    console.error("Error fetching user settings:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch settings" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user, error } = await getUserFromRequest(request);
    if (error || !user) {
      return NextResponse.json(
        { success: false, error: error || "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const validation = updateSettingsSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: validation.error.errors[0].message },
        { status: 400 }
      );
    }

    // CRITICAL: Comprehensive validation for target distribution
    if (validation.data.targetDistribution) {
      const distribution = validation.data.targetDistribution;

      // Use centralized validation logic
      if (!isValidDistribution(distribution)) {
        // Determine specific error reason
        const length = distribution.length;
        const sum = distribution.reduce((a, b) => a + b, 0);
        const hasInvalidValue = distribution.some((v) => v < 0 || v > 100 || isNaN(v));

        let errorMessage = "Invalid target distribution: ";

        if (length < 1 || length > 5) {
          errorMessage += `must have 1-5 values (got ${length})`;
        } else if (hasInvalidValue) {
          errorMessage += "all values must be between 0 and 100";
        } else if (Math.abs(sum - 100) > 0.01) {
          errorMessage += `must sum to 100% (got ${sum.toFixed(2)}%)`;
        } else {
          errorMessage += "format is invalid";
        }

        console.warn("[Settings API] Target distribution validation failed:", {
          distribution,
          length,
          sum,
          hasInvalidValue,
        });

        return NextResponse.json(
          { success: false, error: errorMessage },
          { status: 400 }
        );
      }

      console.log("[Settings API] Target distribution validated successfully:", {
        distribution,
        sum: distribution.reduce((a, b) => a + b, 0).toFixed(2) + "%",
      });
    }

    await connectDB();

    // Fetch user document to check subscription tier
    const userDoc = await User.findOne({ email: user.email });
    if (!userDoc) {
      return NextResponse.json(
        { success: false, error: "User not found" },
        { status: 404 }
      );
    }

    // Validate maxOpenPositions against subscription tier limit
    if (validation.data.maxOpenPositions !== undefined) {
      const subscriptionTier = userDoc.subscriptionTier as keyof typeof TIER_CONFIGS;
      const tierConfig = TIER_CONFIGS[subscriptionTier];
      if (validation.data.maxOpenPositions > tierConfig.features.maxOpenPositions) {
        return NextResponse.json(
          {
            success: false,
            error: `Max open positions cannot exceed ${tierConfig.features.maxOpenPositions} for ${tierConfig.displayName} tier. Please upgrade to increase limits.`,
          },
          { status: 400 }
        );
      }
    }

    const updatedUser = await User.findOneAndUpdate(
      { email: user.email },
      { $set: validation.data },
      { new: true }
    );

    if (!updatedUser) {
      return NextResponse.json(
        { success: false, error: "User not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        maxPositionSize: updatedUser.maxPositionSize,
        maxDailyLoss: updatedUser.maxDailyLoss,
        maxOpenPositions: updatedUser.maxOpenPositions,
        requireApproval: updatedUser.requireApproval,
        emergencyStop: updatedUser.emergencyStop,
        useTestnet: updatedUser.useTestnet || false,
        investmentAmount: updatedUser.investmentAmount,
        targetDistribution: updatedUser.targetDistribution,
        positionSizingMethod: updatedUser.positionSizingMethod,
        riskPercentage: updatedUser.riskPercentage,
        emailNotifications: updatedUser.emailNotifications || {
          onTradeExecuted: true,
          onTargetHit: true,
          onStopLossHit: true,
          dailySummary: false,
        },
        emailFrequency: updatedUser.emailFrequency || "instant",
      },
    });
  } catch (error) {
    console.error("Error updating user settings:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update settings" },
      { status: 500 }
    );
  }
}
