import { createSuccessResponse, createErrorResponse } from "@/lib/utils/api";
import { AuthenticationError } from "@/lib/utils/errors";
import { getCurrentUser } from "@/lib/auth";

export async function GET() {
  try {
    const user = await getCurrentUser();

    if (!user) {
      throw new AuthenticationError();
    }

    return createSuccessResponse({
      user: {
        id: String(user._id),
        email: user.email,
        subscriptionTier: user.subscriptionTier,
        subscriptionExpiry: user.subscriptionExpiry,
        isActive: user.isActive,
        hasApiKeys: !!(user.encryptedApiKey && user.encryptedApiSecret),
        // Trading settings
        investmentAmount: user.investmentAmount,
        targetDistribution: user.targetDistribution,
        positionSizingMethod: user.positionSizingMethod,
        riskPercentage: user.riskPercentage,
        useTestnet: user.useTestnet,
        // Risk management
        maxPositionSize: user.maxPositionSize,
        maxDailyLoss: user.maxDailyLoss,
        maxOpenPositions: user.maxOpenPositions,
        requireApproval: user.requireApproval,
        emergencyStop: user.emergencyStop,
        // Notification settings
        emailNotifications: user.emailNotifications,
        emailFrequency: user.emailFrequency,
      },
    });
  } catch (error) {
    return createErrorResponse(error);
  }
}
