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
