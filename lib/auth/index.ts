import { User } from "@/lib/db/models";
import { getSessionCookie } from "./cookies";
import { verifySessionToken } from "./jwt";
import { IUser } from "@/types";
import { connectDB } from "@/lib/db";

export * from "./jwt";
export * from "./cookies";

export async function getCurrentUser(): Promise<IUser | null> {
  try {
    const token = await getSessionCookie();
    if (!token) {
      // Normal case - no session cookie found
      return null;
    }

    const payload = verifySessionToken(token);
    await connectDB();

    const user = await User.findById(payload.userId);
    if (!user) {
      console.warn(`getCurrentUser: User not found for ID: ${payload.userId}`);
      return null;
    }

    if (!user.isActive) {
      console.warn(`getCurrentUser: User account is inactive for ID: ${payload.userId}`);
      return null;
    }

    return user;
  } catch (error) {
    // Log errors with context for debugging
    console.error("getCurrentUser: Error retrieving current user", {
      error: error instanceof Error ? error.message : String(error),
      name: error instanceof Error ? error.name : "Unknown",
      stack: error instanceof Error ? error.stack : undefined,
    });
    return null;
  }
}

export async function requireAuth(): Promise<IUser> {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error("Authentication required");
  }
  return user;
}
