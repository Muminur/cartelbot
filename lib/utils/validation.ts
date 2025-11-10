import { BinanceSymbolInfo } from "@/types";

export function validateQuantity(quantity: number, symbolInfo: BinanceSymbolInfo): string | null {
  const lotSizeFilter = symbolInfo.filters.find((f) => f.filterType === "LOT_SIZE");
  if (!lotSizeFilter) return null;

  const minQty = parseFloat(lotSizeFilter.minQty || "0");
  const maxQty = parseFloat(lotSizeFilter.maxQty || "0");
  const stepSize = parseFloat(lotSizeFilter.stepSize || "0");

  if (quantity < minQty) {
    return `Quantity ${quantity} is below minimum ${minQty}`;
  }

  if (maxQty > 0 && quantity > maxQty) {
    return `Quantity ${quantity} exceeds maximum ${maxQty}`;
  }

  if (stepSize > 0) {
    const remainder = (quantity - minQty) % stepSize;
    if (Math.abs(remainder) > 1e-8) {
      return `Quantity ${quantity} does not match step size ${stepSize}`;
    }
  }

  return null;
}

export function validatePrice(price: number, symbolInfo: BinanceSymbolInfo): string | null {
  const priceFilter = symbolInfo.filters.find((f) => f.filterType === "PRICE_FILTER");
  if (!priceFilter) return null;

  const minPrice = parseFloat(priceFilter.minPrice || "0");
  const maxPrice = parseFloat(priceFilter.maxPrice || "0");
  const tickSize = parseFloat(priceFilter.tickSize || "0");

  if (price < minPrice) {
    return `Price ${price} is below minimum ${minPrice}`;
  }

  if (maxPrice > 0 && price > maxPrice) {
    return `Price ${price} exceeds maximum ${maxPrice}`;
  }

  if (tickSize > 0) {
    const remainder = (price - minPrice) % tickSize;
    if (Math.abs(remainder) > 1e-8) {
      return `Price ${price} does not match tick size ${tickSize}`;
    }
  }

  return null;
}

export function validateNotional(
  price: number,
  quantity: number,
  symbolInfo: BinanceSymbolInfo
): string | null {
  const notionalFilter = symbolInfo.filters.find((f) => f.filterType === "MIN_NOTIONAL");
  if (!notionalFilter) return null;

  const minNotional = parseFloat(notionalFilter.minNotional || "0");
  const notional = price * quantity;

  if (notional < minNotional) {
    return `Notional ${notional} is below minimum ${minNotional}`;
  }

  return null;
}

export function validateOrder(
  price: number,
  quantity: number,
  symbolInfo: BinanceSymbolInfo
): string[] {
  const errors: string[] = [];

  const priceError = validatePrice(price, symbolInfo);
  if (priceError) errors.push(priceError);

  const quantityError = validateQuantity(quantity, symbolInfo);
  if (quantityError) errors.push(quantityError);

  const notionalError = validateNotional(price, quantity, symbolInfo);
  if (notionalError) errors.push(notionalError);

  return errors;
}
