import crypto from "crypto";
import { env } from "@/lib/config";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const SALT_LENGTH = 64;
const AUTH_TAG_LENGTH = 16;

/**
 * Derives a key from the encryption key using PBKDF2
 */
function deriveKey(salt: Buffer): Buffer {
  return crypto.pbkdf2Sync(env.ENCRYPTION_KEY, salt, 100000, 32, "sha256");
}

/**
 * Encrypts a string using AES-256-GCM
 * @param text - The plaintext string to encrypt
 * @returns The encrypted string in format: salt.iv.authTag.encryptedData (all hex encoded)
 */
export function encrypt(text: string): string {
  if (!text || typeof text !== "string") {
    throw new Error("Invalid input: text must be a non-empty string");
  }

  try {
    const salt = crypto.randomBytes(SALT_LENGTH);
    const key = deriveKey(salt);
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    let encrypted = cipher.update(text, "utf8", "hex");
    encrypted += cipher.final("hex");

    const authTag = cipher.getAuthTag();

    if (authTag.length !== AUTH_TAG_LENGTH) {
      throw new Error("Invalid authentication tag length");
    }

    return [salt.toString("hex"), iv.toString("hex"), authTag.toString("hex"), encrypted].join(
      "."
    );
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Invalid")) {
      throw error;
    }
    console.error("Encryption error:", error);
    throw new Error("Failed to encrypt data");
  }
}

/**
 * Decrypts a string encrypted with the encrypt function
 * @param encryptedText - The encrypted string in format: salt.iv.authTag.encryptedData
 * @returns The decrypted plaintext string
 */
export function decrypt(encryptedText: string): string {
  if (!encryptedText || typeof encryptedText !== "string") {
    throw new Error("Invalid input: encryptedText must be a non-empty string");
  }

  try {
    const parts = encryptedText.split(".");
    if (parts.length !== 4) {
      throw new Error("Invalid encrypted data format");
    }

    const [saltHex, ivHex, authTagHex, encrypted] = parts;

    if (!saltHex || !ivHex || !authTagHex || !encrypted) {
      throw new Error("Invalid encrypted data: missing components");
    }

    const salt = Buffer.from(saltHex, "hex");
    const key = deriveKey(salt);
    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(authTagHex, "hex");

    if (iv.length !== IV_LENGTH) {
      throw new Error("Invalid IV length");
    }

    if (authTag.length !== AUTH_TAG_LENGTH) {
      throw new Error("Invalid authentication tag length");
    }

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Invalid")) {
      throw error;
    }
    console.error("Decryption error:", error);
    throw new Error("Failed to decrypt data or data has been tampered with");
  }
}

/**
 * Hashes a string using SHA256
 * @param text - The text to hash
 * @returns The hex-encoded hash
 */
export function hash(text: string): string {
  return crypto.createHash("sha256").update(text).digest("hex");
}

/**
 * Generates a secure random token
 * @param length - The length of the token in bytes (default: 32)
 * @returns A hex-encoded random token
 */
export function generateToken(length: number = 32): string {
  return crypto.randomBytes(length).toString("hex");
}

/**
 * Creates an HMAC SHA256 signature
 * @param data - The data to sign
 * @param secret - The secret key
 * @returns The hex-encoded signature
 */
export function createSignature(data: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(data).digest("hex");
}

/**
 * Verifies an HMAC SHA256 signature
 * @param data - The original data
 * @param signature - The signature to verify
 * @param secret - The secret key
 * @returns True if the signature is valid
 */
export function verifySignature(data: string, signature: string, secret: string): boolean {
  const expectedSignature = createSignature(data, secret);
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
}
