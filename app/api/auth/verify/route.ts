import { NextRequest } from "next/server";
import { z } from "zod";
import { createSuccessResponse, createErrorResponse } from "@/lib/utils/api";
import { AuthenticationError, ValidationError } from "@/lib/utils/errors";
import { verifyMagicLinkToken, generateSessionToken, setSessionCookie } from "@/lib/auth";
import { User } from "@/lib/db/models";
import { connectDB } from "@/lib/db";
import { rateLimit } from "@/lib/middleware";

const verifySchema = z.object({
  token: z.string().min(1, "Token is required"),
});

export async function POST(request: NextRequest) {
  try {
    // Rate limit by IP to prevent token brute-force attempts
    const ip = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "unknown";
    const rateLimitError = await rateLimit(ip, "auth");
    if (rateLimitError) return rateLimitError;

    const body = await request.json();

    const result = verifySchema.safeParse(body);
    if (!result.success) {
      throw new ValidationError("Invalid token");
    }

    const payload = verifyMagicLinkToken(result.data.token);

    // Attempt database connection with detailed error handling
    try {
      await connectDB();
    } catch (dbError) {
      console.error("Database connection failed during magic link verification:", {
        error: dbError,
        email: payload.email,
        timestamp: new Date().toISOString(),
      });

      // Provide user-friendly error message
      const errorMessage =
        dbError instanceof Error && dbError.message.includes("ETIMEDOUT")
          ? "Database connection timeout. The server may be temporarily unavailable. Please try again in a few moments."
          : dbError instanceof Error && dbError.message.includes("Authentication failed")
          ? "Database authentication failed. Please contact support."
          : "Unable to connect to database. Please try again later or contact support if the issue persists.";

      throw new Error(errorMessage);
    }

    let user = await User.findOne({ email: payload.email });

    if (!user) {
      user = await User.create({
        email: payload.email,
        subscriptionTier: "free",
        isActive: true,
      });
    }

    if (!user.isActive) {
      throw new AuthenticationError("Account is inactive");
    }

    user.lastLogin = new Date();
    await user.save();

    const sessionToken = generateSessionToken(user._id.toString(), user.email);
    await setSessionCookie(sessionToken);

    return createSuccessResponse({
      user: {
        id: user._id.toString(),
        email: user.email,
        subscriptionTier: user.subscriptionTier,
        isActive: user.isActive,
      },
    });
  } catch (error) {
    console.error("Verify error:", error);
    return createErrorResponse(error);
  }
}
