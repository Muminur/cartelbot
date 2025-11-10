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
      },
    });
  } catch (error) {
    return createErrorResponse(error);
  }
}
