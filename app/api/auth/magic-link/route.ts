import { NextRequest } from "next/server";
import { z } from "zod";
import { createSuccessResponse, createErrorResponse, parseRequestBody } from "@/lib/utils/api";
import { ValidationError } from "@/lib/utils/errors";
import { generateMagicLinkToken } from "@/lib/auth";
import { sendMagicLinkEmail } from "@/lib/email";
import { REGEX_PATTERNS } from "@/lib/constants";

const magicLinkSchema = z.object({
  email: z.string().email("Invalid email format").regex(REGEX_PATTERNS.EMAIL),
});

export async function POST(request: NextRequest) {
  try {
    const body = await parseRequestBody<{ email: string }>(request);

    const result = magicLinkSchema.safeParse(body);
    if (!result.success) {
      throw new ValidationError("Invalid email address");
    }

    const { email } = result.data;
    const normalizedEmail = email.toLowerCase().trim();

    const token = generateMagicLinkToken(normalizedEmail);

    await sendMagicLinkEmail(normalizedEmail, token);

    return createSuccessResponse(
      { message: "Magic link sent to your email" },
      200
    );
  } catch (error) {
    console.error("Magic link error:", error);
    return createErrorResponse(error);
  }
}
