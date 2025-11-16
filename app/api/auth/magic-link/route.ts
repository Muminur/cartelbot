import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createSuccessResponse, parseRequestBody } from "@/lib/utils/api";
import { generateMagicLinkToken } from "@/lib/auth";
import { sendMagicLinkEmail } from "@/lib/email";
import { REGEX_PATTERNS } from "@/lib/constants";

const magicLinkSchema = z.object({
  email: z.string().email("Invalid email format").regex(REGEX_PATTERNS.EMAIL),
});

/**
 * Fix 3: Standardize Error Response Format
 * All errors return consistent structure: { success: false, error: { code, message, statusCode } }
 * This ensures reliable client-side error handling and prevents enumeration attacks.
 */
export async function POST(request: NextRequest) {
  try {
    // Validate environment first to provide clear error
    if (!process.env.RESEND_API_KEY) {
      console.error("RESEND_API_KEY not configured - magic link will fail");
      // Return standardized error response
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "EMAIL_SERVICE_ERROR",
            message: "Email service is not configured. Please contact support.",
            statusCode: 500,
          },
        },
        { status: 500 }
      );
    }

    const body = await parseRequestBody<{ email: string }>(request);

    // Early validation with standardized error
    if (!body.email) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "EMAIL_REQUIRED",
            message: "Email address is required",
            statusCode: 400,
          },
        },
        { status: 400 }
      );
    }

    const result = magicLinkSchema.safeParse(body);
    if (!result.success) {
      // Return validation error with standardized format
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "INVALID_EMAIL",
            message: "Invalid email address format",
            statusCode: 400,
          },
        },
        { status: 400 }
      );
    }

    const { email } = result.data;
    const normalizedEmail = email.toLowerCase().trim();

    const token = generateMagicLinkToken(normalizedEmail);

    // Attempt to send email with proper error handling
    try {
      await sendMagicLinkEmail(normalizedEmail, token);
    } catch (emailError) {
      console.error("Failed to send magic link email:", {
        error: emailError instanceof Error ? emailError.message : String(emailError),
        email: normalizedEmail,
        timestamp: new Date().toISOString(),
      });

      // Generic error message to prevent email enumeration
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "EMAIL_SEND_FAILED",
            message: "Unable to send magic link. Please try again or contact support.",
            statusCode: 500,
          },
        },
        { status: 500 }
      );
    }

    return createSuccessResponse(
      { message: "Magic link sent to your email" },
      200
    );
  } catch (error) {
    console.error("Magic link error:", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString(),
    });

    // Ensure we ALWAYS return standardized JSON, even for unexpected errors
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "An unexpected error occurred. Please try again.",
          statusCode: 500,
        },
      },
      { status: 500 }
    );
  }
}
