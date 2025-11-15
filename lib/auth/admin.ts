import { NextRequest } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import type { IUser } from "@/types";

const ADMIN_EMAILS =
  process.env.ADMIN_EMAILS?.split(",").map((e) => e.trim().toLowerCase()) || [];

export function isAdmin(user: IUser): boolean {
  if (ADMIN_EMAILS.length === 0) {
    throw new Error("ADMIN_EMAILS not configured in environment");
  }
  return ADMIN_EMAILS.includes(user.email.toLowerCase());
}

export async function requireAdmin(request: NextRequest): Promise<IUser> {
  const { user, error } = await getUserFromRequest(request);

  if (!user || error) {
    throw new Error("Authentication required");
  }

  if (!isAdmin(user)) {
    console.warn("Unauthorized admin access attempt:", {
      userId: user._id,
      email: user.email,
      ip: request.headers.get("x-forwarded-for"),
      timestamp: new Date().toISOString(),
    });

    throw new Error("Admin access required");
  }

  return user;
}
