/**
 * Test script for encryption utilities
 * Tests AES-256-GCM encryption/decryption
 */

const crypto = require('crypto');

// Mock environment variable
process.env.ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const SALT_LENGTH = 64;
const AUTH_TAG_LENGTH = 16;

function deriveKey(salt) {
  return crypto.pbkdf2Sync(process.env.ENCRYPTION_KEY, salt, 100000, 32, "sha256");
}

function encrypt(text) {
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

    return [salt.toString("hex"), iv.toString("hex"), authTag.toString("hex"), encrypted].join(".");
  } catch (error) {
    if (error.message.startsWith("Invalid")) {
      throw error;
    }
    console.error("Encryption error:", error);
    throw new Error("Failed to encrypt data");
  }
}

function decrypt(encryptedText) {
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
    if (error.message.startsWith("Invalid")) {
      throw error;
    }
    console.error("Decryption error:", error);
    throw new Error("Failed to decrypt data or data has been tampered with");
  }
}

function hash(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

function generateToken(length = 32) {
  return crypto.randomBytes(length).toString("hex");
}

function createSignature(data, secret) {
  return crypto.createHmac("sha256", secret).update(data).digest("hex");
}

function verifySignature(data, signature, secret) {
  const expectedSignature = createSignature(data, secret);
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
}

// Test suite
console.log("🧪 Testing Encryption Utilities...\n");

let testsPassed = 0;
let testsFailed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✅ ${name}`);
    testsPassed++;
  } catch (error) {
    console.error(`❌ ${name}`);
    console.error(`   Error: ${error.message}`);
    testsFailed++;
  }
}

// Test 1: Basic encryption/decryption
test("Basic encryption and decryption", () => {
  const plaintext = "test-api-key-12345";
  const encrypted = encrypt(plaintext);
  const decrypted = decrypt(encrypted);

  if (decrypted !== plaintext) {
    throw new Error(`Expected '${plaintext}', got '${decrypted}'`);
  }
  if (!encrypted.includes('.')) {
    throw new Error("Encrypted text should contain dot separators");
  }
});

// Test 2: Long text encryption
test("Long text encryption", () => {
  const longText = "a".repeat(10000);
  const encrypted = encrypt(longText);
  const decrypted = decrypt(encrypted);

  if (decrypted !== longText) {
    throw new Error("Long text decryption failed");
  }
});

// Test 3: Special characters
test("Special characters encryption", () => {
  const specialText = "!@#$%^&*()_+-=[]{}|;:',.<>?/`~";
  const encrypted = encrypt(specialText);
  const decrypted = decrypt(encrypted);

  if (decrypted !== specialText) {
    throw new Error("Special characters decryption failed");
  }
});

// Test 4: Invalid input handling
test("Invalid input - empty string", () => {
  try {
    encrypt("");
    throw new Error("Should have thrown error for empty string");
  } catch (error) {
    if (!error.message.includes("Invalid input")) {
      throw error;
    }
  }
});

// Test 5: Invalid encrypted data
test("Invalid encrypted data format", () => {
  try {
    decrypt("invalid-data");
    throw new Error("Should have thrown error for invalid data");
  } catch (error) {
    if (!error.message.includes("Invalid encrypted data format")) {
      throw error;
    }
  }
});

// Test 6: Tampered data detection
test("Tampered data detection", () => {
  const plaintext = "secret-key";
  const encrypted = encrypt(plaintext);
  const parts = encrypted.split('.');
  parts[3] = parts[3].substring(0, parts[3].length - 2) + "ff"; // Tamper with encrypted data
  const tampered = parts.join('.');

  try {
    decrypt(tampered);
    throw new Error("Should have detected tampered data");
  } catch (error) {
    if (!error.message.includes("Failed to decrypt")) {
      throw error;
    }
  }
});

// Test 7: Hash function
test("Hash function", () => {
  const text = "test-data";
  const hash1 = hash(text);
  const hash2 = hash(text);

  if (hash1 !== hash2) {
    throw new Error("Same input should produce same hash");
  }
  if (hash1.length !== 64) {
    throw new Error("SHA256 hash should be 64 characters");
  }
});

// Test 8: Token generation
test("Token generation", () => {
  const token1 = generateToken();
  const token2 = generateToken();

  if (token1 === token2) {
    throw new Error("Tokens should be unique");
  }
  if (token1.length !== 64) {
    throw new Error("32-byte token should be 64 hex characters");
  }
});

// Test 9: HMAC signature creation
test("HMAC signature creation", () => {
  const data = "test-data";
  const secret = "test-secret";
  const sig1 = createSignature(data, secret);
  const sig2 = createSignature(data, secret);

  if (sig1 !== sig2) {
    throw new Error("Same data and secret should produce same signature");
  }
  if (sig1.length !== 64) {
    throw new Error("HMAC SHA256 signature should be 64 characters");
  }
});

// Test 10: Signature verification
test("Signature verification", () => {
  const data = "test-data";
  const secret = "test-secret";
  const signature = createSignature(data, secret);

  if (!verifySignature(data, signature, secret)) {
    throw new Error("Valid signature should verify");
  }

  if (verifySignature(data + "tampered", signature, secret)) {
    throw new Error("Tampered data should not verify");
  }

  if (verifySignature(data, signature, "wrong-secret")) {
    throw new Error("Wrong secret should not verify");
  }
});

// Test 11: Multiple encrypt/decrypt cycles
test("Multiple encrypt/decrypt cycles", () => {
  let text = "original-data";

  for (let i = 0; i < 100; i++) {
    const encrypted = encrypt(text);
    const decrypted = decrypt(encrypted);
    if (decrypted !== text) {
      throw new Error(`Cycle ${i} failed`);
    }
  }
});

// Test 12: Different plaintexts produce different ciphertexts
test("Different plaintexts produce different ciphertexts", () => {
  const encrypted1 = encrypt("text1");
  const encrypted2 = encrypt("text2");

  if (encrypted1 === encrypted2) {
    throw new Error("Different plaintexts should produce different ciphertexts");
  }
});

// Test 13: Same plaintext produces different ciphertexts (randomization)
test("Same plaintext produces different ciphertexts", () => {
  const plaintext = "same-text";
  const encrypted1 = encrypt(plaintext);
  const encrypted2 = encrypt(plaintext);

  if (encrypted1 === encrypted2) {
    throw new Error("Same plaintext should produce different ciphertexts due to random IV and salt");
  }

  const decrypted1 = decrypt(encrypted1);
  const decrypted2 = decrypt(encrypted2);

  if (decrypted1 !== plaintext || decrypted2 !== plaintext) {
    throw new Error("Both should decrypt to original plaintext");
  }
});

console.log("\n" + "=".repeat(50));
console.log(`Tests passed: ${testsPassed}`);
console.log(`Tests failed: ${testsFailed}`);
console.log("=".repeat(50));

if (testsFailed > 0) {
  process.exit(1);
}

console.log("\n✅ All encryption tests passed!");
