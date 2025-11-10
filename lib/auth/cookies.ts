import { cookies } from "next/headers";
import { env } from "@/lib/config";

const SESSION_COOKIE_NAME = "session";
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60;

export async function setSessionCookie(token: string): Promise<void> {
  const cookieStore = await cookies();

  const cookieOptions: {
    httpOnly: boolean;
    secure: boolean;
    sameSite: "strict";
    maxAge: number;
    path: string;
    domain?: string;
  } = {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: COOKIE_MAX_AGE,
    path: "/",
  };

  // Add domain in production for better security
  if (env.NODE_ENV === "production" && env.NEXT_PUBLIC_API_URL) {
    try {
      const url = new URL(env.NEXT_PUBLIC_API_URL);
      cookieOptions.domain = url.hostname;
    } catch {
      // If URL parsing fails, skip domain attribute
    }
  }

  cookieStore.set(SESSION_COOKIE_NAME, token, cookieOptions);
}

export async function getSessionCookie(): Promise<string | undefined> {
  const cookieStore = await cookies();
  return cookieStore.get(SESSION_COOKIE_NAME)?.value;
}

export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}
