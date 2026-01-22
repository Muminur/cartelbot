/**
 * Discord Token Validator
 *
 * Validates Discord user tokens by making authenticated requests to the Discord API.
 * Uses TLS fingerprinting to avoid detection.
 */

import { getDiscordHeaders } from "./tls-fingerprint";

interface TokenValidationResult {
  valid: boolean;
  userId?: string;
  username?: string;
  discriminator?: string;
  error?: string;
}

/**
 * Validate a Discord user token by calling the Discord API
 *
 * @param token Discord user token to validate
 * @returns Validation result with user info if valid
 */
export async function validateDiscordToken(
  token: string
): Promise<TokenValidationResult> {
  // Input validation
  if (!token || typeof token !== "string") {
    return { valid: false, error: "Token is required" };
  }

  // Token length check (Discord tokens are typically 50-150 chars)
  if (token.length < 50 || token.length > 150) {
    return { valid: false, error: "Invalid token format" };
  }

  // Strip "Bot " prefix if accidentally included
  const cleanToken = token.replace(/^Bot\s+/i, "").trim();

  try {
    const response = await fetch("https://discord.com/api/v10/users/@me", {
      method: "GET",
      headers: getDiscordHeaders(cleanToken),
    });

    if (!response.ok) {
      if (response.status === 401) {
        return { valid: false, error: "Invalid or expired token" };
      }
      if (response.status === 429) {
        return { valid: false, error: "Rate limited - try again later" };
      }
      return { valid: false, error: `Discord API error: ${response.status}` };
    }

    const userData = await response.json();

    // Sanitize log output - only show username in dev mode
    if (process.env.NODE_ENV !== "production") {
      console.log("[TokenValidator] Validated user:", userData.username);
    }

    return {
      valid: true,
      userId: userData.id,
      username: userData.username,
      discriminator: userData.discriminator || "0",
    };
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.error("[TokenValidator] Validation error:", error);
    }

    return {
      valid: false,
      error: error instanceof Error ? error.message : "Failed to validate token",
    };
  }
}
