import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { connectDB } from "@/lib/db/connection";
import { User } from "@/lib/db/models/User";
import { TIER_CONFIGS } from "@/lib/subscription/constants";
import { isValidDistribution } from "@/lib/binance/risk-manager";
import { z } from "zod";
import { rateLimit } from "@/lib/middleware";
import { logUserAction } from "@/lib/audit";

const updateSettingsSchema = z.object({
  maxPositionSize: z.number().min(10).max(100000).optional(),
  maxDailyLoss: z.number().min(0).max(50000).optional(),
  maxOpenPositions: z.number().min(1).max(200).optional(),
  requireApproval: z.boolean().optional(),
  emergencyStop: z.boolean().optional(),
  useTestnet: z.boolean().optional(),
  investmentAmount: z.number().min(10).max(100000).optional(),
  maxTargets: z.number().min(1).max(5).optional(),
  targetDistribution: z.array(z.number()).min(1).max(5).optional(),
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

    const rateLimitError = await rateLimit(user.email, "api");
    if (rateLimitError) return rateLimitError;

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
        maxTargets: userDoc.maxTargets || 3,
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

    const rateLimitError = await rateLimit(user.email, "api");
    if (rateLimitError) return rateLimitError;

    const body = await request.json();
    const validation = updateSettingsSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: validation.error.errors[0].message },
        { status: 400 }
      );
    }

    // CRITICAL: Comprehensive validation for maxTargets and target distribution
    const maxTargets = validation.data.maxTargets;
    const targetDistribution = validation.data.targetDistribution;

    // If maxTargets is provided, validate it
    if (maxTargets !== undefined && (maxTargets < 1 || maxTargets > 5)) {
      return NextResponse.json(
        { success: false, error: "maxTargets must be between 1 and 5" },
        { status: 400 }
      );
    }

    // If both maxTargets and targetDistribution are provided, ensure they match
    if (maxTargets !== undefined && targetDistribution !== undefined) {
      if (targetDistribution.length !== maxTargets) {
        return NextResponse.json(
          {
            success: false,
            error: `Target distribution length (${targetDistribution.length}) must equal maxTargets (${maxTargets})`
          },
          { status: 400 }
        );
      }
    }

    // Validate target distribution
    if (targetDistribution) {
      // Use centralized validation logic
      if (!isValidDistribution(targetDistribution)) {
        // Determine specific error reason
        const length = targetDistribution.length;
        const sum = targetDistribution.reduce((a, b) => a + b, 0);
        const hasInvalidValue = targetDistribution.some((v) => v < 0 || v > 100 || isNaN(v));

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
          distribution: targetDistribution,
          length,
          sum,
          hasInvalidValue,
        });

        return NextResponse.json(
          { success: false, error: errorMessage },
          { status: 400 }
        );
      }

      if (process.env.NODE_ENV !== 'production') console.log("[Settings API] Target distribution validated successfully:", {
        distribution: targetDistribution,
        sum: targetDistribution.reduce((a, b) => a + b, 0).toFixed(2) + "%",
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

    await logUserAction(request, "user.settings.update", String(updatedUser._id), 200, {
      updatedFields: Object.keys(validation.data),
    });

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
        maxTargets: updatedUser.maxTargets || 3,
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
