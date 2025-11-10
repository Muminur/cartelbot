import jwt from "jsonwebtoken";
import { env } from "@/lib/config";

export interface JWTPayload {
  email: string;
  type: "magic-link" | "session";
  iat?: number;
  exp?: number;
}

export interface SessionPayload {
  userId: string;
  email: string;
  type: "session";
}

const MAGIC_LINK_EXPIRY = "15m";
const SESSION_EXPIRY = "7d";

export function generateMagicLinkToken(email: string): string {
  return jwt.sign({ email, type: "magic-link" } as JWTPayload, env.JWT_SECRET, {
    expiresIn: MAGIC_LINK_EXPIRY,
  });
}

export function generateSessionToken(userId: string, email: string): string {
  return jwt.sign({ userId, email, type: "session" } as SessionPayload, env.JWT_SECRET, {
    expiresIn: SESSION_EXPIRY,
  });
}

export function verifyMagicLinkToken(token: string): JWTPayload {
  try {
    const payload = jwt.verify(token, env.JWT_SECRET, {
      algorithms: ['HS256']
    }) as JWTPayload;
    if (payload.type !== "magic-link") {
      throw new Error("Invalid token type");
    }
    return payload;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new Error("Magic link has expired");
    }
    if (error instanceof jwt.JsonWebTokenError) {
      throw new Error("Invalid magic link");
    }
    throw new Error("Token verification failed");
  }
}

export function verifySessionToken(token: string): SessionPayload {
  try {
    const payload = jwt.verify(token, env.JWT_SECRET, {
      algorithms: ['HS256']
    }) as SessionPayload;
    if (payload.type !== "session") {
      throw new Error("Invalid token type");
    }
    return payload;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new Error("Session has expired");
    }
    if (error instanceof jwt.JsonWebTokenError) {
      throw new Error("Invalid session");
    }
    throw new Error("Session verification failed");
  }
}
