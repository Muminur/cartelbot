import { NextResponse } from "next/server";
import crypto from "crypto";

const CSRF_TOKEN_LENGTH = 32;
const CSRF_COOKIE_NAME = "csrf-token";
const CSRF_HEADER_NAME = "x-csrf-token";
const TOKEN_EXPIRY = 3600000;

interface CsrfToken {
  token: string;
  expires: number;
}

const tokenStore = new Map<string, CsrfToken>();

function cleanupExpiredTokens(): void {
  const now = Date.now();
  for (const [key, value] of tokenStore.entries()) {
    if (value.expires < now) {
      tokenStore.delete(key);
    }
  }
}

setInterval(cleanupExpiredTokens, 300000);

export function generateCsrfToken(sessionId: string): string {
  const token = crypto.randomBytes(CSRF_TOKEN_LENGTH).toString("hex");
  const expires = Date.now() + TOKEN_EXPIRY;

  tokenStore.set(sessionId, { token, expires });

  return token;
}

export function verifyCsrfToken(sessionId: string, providedToken: string): boolean {
  const stored = tokenStore.get(sessionId);

  if (!stored) return false;
  if (stored.expires < Date.now()) {
    tokenStore.delete(sessionId);
    return false;
  }

  return crypto.timingSafeEqual(Buffer.from(stored.token), Buffer.from(providedToken));
}

export function getCsrfTokenFromRequest(request: Request): string | null {
  const headerToken = request.headers.get(CSRF_HEADER_NAME);
  if (headerToken) return headerToken;

  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) return null;

  const cookies = cookieHeader.split(";");
  for (const cookie of cookies) {
    const [name, value] = cookie.trim().split("=");
    if (name === CSRF_COOKIE_NAME) {
      return decodeURIComponent(value);
    }
  }

  return null;
}

export async function requireCsrfToken(
  request: Request,
  sessionId: string
): Promise<NextResponse | null> {
  const method = request.method.toUpperCase();

  if (["GET", "HEAD", "OPTIONS"].includes(method)) {
    return null;
  }

  const providedToken = getCsrfTokenFromRequest(request);

  if (!providedToken) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "CSRF_TOKEN_MISSING",
          message: "CSRF token is required",
          statusCode: 403,
        },
      },
      { status: 403 }
    );
  }

  if (!verifyCsrfToken(sessionId, providedToken)) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "CSRF_TOKEN_INVALID",
          message: "Invalid CSRF token",
          statusCode: 403,
        },
      },
      { status: 403 }
    );
  }

  return null;
}

export function createCsrfCookie(token: string): string {
  return `${CSRF_COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=3600`;
}

export function getCsrfHeaders(sessionId: string): Record<string, string> {
  const token = generateCsrfToken(sessionId);
  return {
    "Set-Cookie": createCsrfCookie(token),
    [CSRF_HEADER_NAME]: token,
  };
}
