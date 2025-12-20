/**
 * Discord TLS/JA3 Fingerprinting for Anti-Detection
 *
 * Provides browser-level TLS fingerprinting and headers to mimic
 * a real Discord web client (Chrome 124) and avoid self-bot detection.
 *
 * STEALTH FEATURES:
 * - X-Super-Properties header with Base64-encoded client fingerprint
 * - Complete Chrome 124 browser headers
 * - Discord build number matching current client version
 * - User-Agent spoofing
 * - Sec-Ch-Ua headers for Chrome fingerprint
 */

/**
 * Discord client build number
 * Update periodically from Discord client to match current version
 */
export const DISCORD_BUILD_NUMBER = 291963;

/**
 * Browser User-Agent string (Chrome 124 on Windows 10)
 */
export const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

/**
 * Browser version
 */
export const BROWSER_VERSION = "124.0.0.0";

/**
 * Super Properties interface
 * Contains client fingerprint data sent to Discord API
 */
interface SuperProperties {
  os: string;
  browser: string;
  device: string;
  system_locale: string;
  browser_user_agent: string;
  browser_version: string;
  os_version: string;
  referrer: string;
  referring_domain: string;
  referrer_current: string;
  referring_domain_current: string;
  release_channel: string;
  client_build_number: number;
  client_event_source: null;
  design_id: number;
}

/**
 * Generate X-Super-Properties header value
 *
 * This header mimics a real Discord web client fingerprint to avoid detection.
 * The properties are Base64-encoded JSON that Discord uses to identify clients.
 *
 * @returns Base64-encoded super properties string
 */
export function getSuperProperties(): string {
  const properties: SuperProperties = {
    os: "Windows",
    browser: "Chrome",
    device: "",
    system_locale: "en-US",
    browser_user_agent: BROWSER_USER_AGENT,
    browser_version: BROWSER_VERSION,
    os_version: "10",
    referrer: "",
    referring_domain: "",
    referrer_current: "",
    referring_domain_current: "",
    release_channel: "stable",
    client_build_number: DISCORD_BUILD_NUMBER,
    client_event_source: null,
    design_id: 0,
  };

  // Convert to Base64
  return Buffer.from(JSON.stringify(properties)).toString("base64");
}

/**
 * Generate complete Discord client headers for anti-detection
 *
 * These headers mimic a real Discord web client to avoid bot detection.
 * Includes all headers that a real Chrome browser would send.
 *
 * CRITICAL: These headers must match a real Discord client to avoid detection.
 *
 * @param token Discord user token
 * @returns Complete HTTP headers object
 */
export function getDiscordHeaders(token: string): Record<string, string> {
  return {
    Authorization: token,
    "User-Agent": BROWSER_USER_AGENT,
    "X-Super-Properties": getSuperProperties(),
    "X-Discord-Locale": "en-US",
    "X-Discord-Timezone": "America/New_York",
    "Content-Type": "application/json",
    Accept: "*/*",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    Origin: "https://discord.com",
    Referer: "https://discord.com/channels/@me",
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "same-origin",
    "Sec-Ch-Ua":
      '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
    "Sec-Ch-Ua-Mobile": "?0",
    "Sec-Ch-Ua-Platform": '"Windows"',
  };
}

/**
 * TLS Fingerprinter class for managing anti-detection features
 */
export class TLSFingerprinter {
  /**
   * Get X-Super-Properties header value
   */
  getSuperProperties(): string {
    return getSuperProperties();
  }

  /**
   * Get complete Discord headers for a token
   */
  getDiscordHeaders(token: string): Record<string, string> {
    return getDiscordHeaders(token);
  }

  /**
   * Get browser User-Agent
   */
  getUserAgent(): string {
    return BROWSER_USER_AGENT;
  }

  /**
   * Get Discord build number
   */
  getBuildNumber(): number {
    return DISCORD_BUILD_NUMBER;
  }
}

// Export singleton instance
export const tlsFingerprinter = new TLSFingerprinter();
