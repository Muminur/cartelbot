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
    if (!token) return null;

    const payload = verifySessionToken(token);
    await connectDB();

    const user = await User.findById(payload.userId);
    if (!user || !user.isActive) return null;

    return user;
  } catch {
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
