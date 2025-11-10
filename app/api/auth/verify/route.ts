import { NextRequest } from "next/server";
import { z } from "zod";
import { createSuccessResponse, createErrorResponse } from "@/lib/utils/api";
import { AuthenticationError, ValidationError } from "@/lib/utils/errors";
import { verifyMagicLinkToken, generateSessionToken, setSessionCookie } from "@/lib/auth";
import { User } from "@/lib/db/models";
import { connectDB } from "@/lib/db";

const verifySchema = z.object({
  token: z.string().min(1, "Token is required"),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const result = verifySchema.safeParse(body);
    if (!result.success) {
      throw new ValidationError("Invalid token");
    }

    const payload = verifyMagicLinkToken(result.data.token);

    await connectDB();

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
