export function formatPrice(price: number, decimals: number = 8): string {
  return price.toFixed(decimals).replace(/\.?0+$/, "");
}

export function formatQuantity(quantity: number, stepSize: string): number {
  // Count decimal places by finding position of '1' after decimal point
  const decimalIndex = stepSize.indexOf(".");
  const oneIndex = stepSize.indexOf("1");

  if (decimalIndex === -1 || oneIndex < decimalIndex) {
    // No decimal point, or '1' before decimal (e.g., "1.00000000"), step is whole number
    return Math.floor(quantity);
  }

  // Precision is the number of decimal places where the significant digit '1' appears
  const precision = oneIndex - decimalIndex;
  const multiplier = Math.pow(10, precision);
  return Math.floor(quantity * multiplier) / multiplier;
}

export function formatPriceByTickSize(price: number, tickSize: string): number {
  // Count decimal places by finding position of '1' after decimal point
  const decimalIndex = tickSize.indexOf(".");
  const oneIndex = tickSize.indexOf("1");

  if (decimalIndex === -1 || oneIndex < decimalIndex) {
    // No decimal point, or '1' before decimal (e.g., "1.00000000"), tick is whole number
    return Math.round(price);
  }

  // Precision is the number of decimal places where the significant digit '1' appears
  const precision = oneIndex - decimalIndex;
  const multiplier = Math.pow(10, precision);
  return Math.round(price * multiplier) / multiplier;
}

export function formatPercentage(value: number, decimals: number = 2): string {
  return `${(value * 100).toFixed(decimals)}%`;
}

export function formatUSDT(amount: number): string {
  return `${amount.toFixed(2)} USDT`;
}

export function formatSymbol(symbol: string): string {
  if (symbol.endsWith("USDT")) {
    return symbol.replace("USDT", "");
  }
  return symbol;
}

export function parseSymbolToUsdt(symbol: string): string {
  const cleaned = symbol.replace(/[\$\s]/g, "").toUpperCase();
  if (cleaned.endsWith("USDT")) {
    return cleaned;
  }
  return `${cleaned}USDT`;
}

export function formatCurrency(amount: number, decimals: number = 2): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(amount);
}

export function formatNumber(value: number, decimals: number = 2): string {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

export function formatDate(date: Date | string | unknown, format: "short" | "long" = "short"): string {
  // Ensure we have a proper Date instance
  let dateObj: Date;

  if (date instanceof Date) {
    // Already a Date instance
    dateObj = date;
  } else if (typeof date === "string" || typeof date === "number") {
    // String or number (timestamp)
    dateObj = new Date(date);
  } else if (date && typeof date === "object") {
    // Plain object that might have been a Date (from JSON serialization)
    // Try to extract the date value if it exists
    const dateValue = (date as { toJSON?: () => string; toString?: () => string }).toJSON?.()
      || (date as { toString?: () => string }).toString?.();
    dateObj = new Date(dateValue || "");
  } else {
    // Invalid input
    console.warn("[formatDate] Invalid date input type:", typeof date, date);
    return "Invalid Date";
  }

  // Validate date is finite and valid
  if (!dateObj || typeof dateObj.getTime !== "function" || isNaN(dateObj.getTime()) || !isFinite(dateObj.getTime())) {
    console.warn("[formatDate] Invalid date value:", date);
    return "Invalid Date";
  }

  if (format === "long") {
    return new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).format(dateObj);
  }

  // Short format: "Nov 11, 2025 14:30"
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(dateObj);
}
