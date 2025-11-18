import { NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { env } from "@/lib/config/env";
import { IUser } from "@/types";

/**
 * Admin authentication middleware
 * Checks if authenticated user is an admin based on ADMIN_EMAILS env var
 *
 * Usage in API routes:
 * const adminCheck = await requireAdmin(request);
 * if (adminCheck.error) return adminCheck.response;
 */

const ADMIN_EMAILS = env.ADMIN_EMAILS.split(",").map((email) => email.trim().toLowerCase());

export async function requireAdmin(request: Request): Promise<{
  user: IUser | null;
  error: boolean;
  response?: NextResponse;
}> {
  const { user, error } = await getUserFromRequest(request);

  if (error || !user) {
    return {
      user: null,
      error: true,
      response: NextResponse.json(
        {
          success: false,
          error: {
            code: "UNAUTHORIZED",
            message: "Authentication required",
            statusCode: 401,
          },
        },
        { status: 401 }
      ),
    };
  }

  const userEmail = user.email.toLowerCase();
  if (!ADMIN_EMAILS.includes(userEmail)) {
    return {
      user: null,
      error: true,
      response: NextResponse.json(
        {
          success: false,
          error: {
            code: "FORBIDDEN",
            message: "Admin access required",
            statusCode: 403,
          },
        },
        { status: 403 }
      ),
    };
  }

  return { user, error: false };
}

export function isAdmin(email: string): boolean {
  return ADMIN_EMAILS.includes(email.toLowerCase());
}
