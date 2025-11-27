const HTML_ENTITIES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#x27;",
  "/": "&#x2F;",
};

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"'\/]/g, (char) => HTML_ENTITIES[char] || char);
}

export function sanitizeString(input: string, maxLength = 1000): string {
  let sanitized = input.trim();
  sanitized = sanitized.substring(0, maxLength);
  sanitized = sanitized.replace(/[\x00-\x1F\x7F]/g, "");
  return sanitized;
}

export function sanitizeEmail(email: string): string {
  const sanitized = email.trim().toLowerCase();
  const emailRegex = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/;
  if (!emailRegex.test(sanitized)) {
    throw new Error("Invalid email format");
  }
  return sanitized;
}

export function sanitizeSignalText(text: string): string {
  let sanitized = text.trim();
  sanitized = sanitized.replace(/<script[^>]*>.*?<\/script>/gi, "");
  sanitized = sanitized.replace(/<iframe[^>]*>.*?<\/iframe>/gi, "");
  sanitized = sanitized.replace(/javascript:/gi, "");
  sanitized = sanitized.replace(/on\w+\s*=/gi, "");
  return sanitized;
}

export function sanitizeFilename(filename: string): string {
  let sanitized = filename.trim();
  sanitized = sanitized.replace(/[^a-zA-Z0-9._-]/g, "_");
  sanitized = sanitized.substring(0, 255);
  return sanitized;
}

export function sanitizeNumeric(input: string | number): number {
  const num = typeof input === "string" ? parseFloat(input) : input;
  if (isNaN(num) || !isFinite(num)) {
    throw new Error("Invalid numeric value");
  }
  return num;
}

export function sanitizeAlphanumeric(input: string, allowSpaces = false): string {
  const pattern = allowSpaces ? /[^a-zA-Z0-9\s]/g : /[^a-zA-Z0-9]/g;
  return input.replace(pattern, "");
}

export function sanitizeSymbol(symbol: string): string {
  const sanitized = symbol.toUpperCase().trim();
  if (!/^[A-Z0-9]{2,20}$/.test(sanitized)) {
    throw new Error("Invalid symbol format");
  }
  return sanitized;
}

export function sanitizeUrl(url: string, allowedProtocols = ["https", "http"]): string {
  try {
    const parsed = new URL(url);
    if (!allowedProtocols.includes(parsed.protocol.replace(":", ""))) {
      throw new Error("Invalid protocol");
    }
    return parsed.toString();
  } catch {
    throw new Error("Invalid URL format");
  }
}

export function sanitizeObject<T extends Record<string, unknown>>(
  obj: T,
  allowedKeys: string[]
): Partial<T> {
  const sanitized: Partial<T> = {};
  for (const key of allowedKeys) {
    if (key in obj) {
      sanitized[key as keyof T] = obj[key] as T[keyof T];
    }
  }
  return sanitized;
}
