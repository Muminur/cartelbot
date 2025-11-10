import { BinanceSymbolFilter } from "@/types";
import { formatPriceByTickSize, formatQuantity } from "@/lib/utils/format";

interface FilterValidationResult {
  isValid: boolean;
  errors: string[];
  adjustedPrice?: number;
  adjustedQuantity?: number;
}

export function validateAndAdjustPrice(
  price: number,
  filters: BinanceSymbolFilter[]
): FilterValidationResult {
  const errors: string[] = [];
  let adjustedPrice = price;

  const priceFilter = filters.find((f) => f.filterType === "PRICE_FILTER");
  if (priceFilter) {
    const { minPrice, maxPrice, tickSize } = priceFilter;

    if (minPrice && price < parseFloat(minPrice)) {
      errors.push(`Price ${price} is below minimum ${minPrice}`);
      adjustedPrice = parseFloat(minPrice);
    }

    if (maxPrice && price > parseFloat(maxPrice)) {
      errors.push(`Price ${price} is above maximum ${maxPrice}`);
      adjustedPrice = parseFloat(maxPrice);
    }

    if (tickSize) {
      adjustedPrice = formatPriceByTickSize(adjustedPrice, tickSize);
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    adjustedPrice,
  };
}

export function validateAndAdjustQuantity(
  quantity: number,
  filters: BinanceSymbolFilter[]
): FilterValidationResult {
  const errors: string[] = [];
  let adjustedQuantity = quantity;

  const lotSizeFilter = filters.find((f) => f.filterType === "LOT_SIZE");
  if (lotSizeFilter) {
    const { minQty, maxQty, stepSize } = lotSizeFilter;

    if (minQty && quantity < parseFloat(minQty)) {
      errors.push(`Quantity ${quantity} is below minimum ${minQty}`);
      adjustedQuantity = parseFloat(minQty);
    }

    if (maxQty && quantity > parseFloat(maxQty)) {
      errors.push(`Quantity ${quantity} is above maximum ${maxQty}`);
      adjustedQuantity = parseFloat(maxQty);
    }

    if (stepSize) {
      adjustedQuantity = formatQuantity(adjustedQuantity, stepSize);
    }
  }

  const marketLotSize = filters.find((f) => f.filterType === "MARKET_LOT_SIZE");
  if (marketLotSize) {
    const { minQty, maxQty, stepSize } = marketLotSize;

    if (minQty && quantity < parseFloat(minQty)) {
      errors.push(`Market order quantity ${quantity} is below minimum ${minQty}`);
      adjustedQuantity = parseFloat(minQty);
    }

    if (maxQty && quantity > parseFloat(maxQty)) {
      errors.push(`Market order quantity ${quantity} is above maximum ${maxQty}`);
      adjustedQuantity = parseFloat(maxQty);
    }

    if (stepSize) {
      adjustedQuantity = formatQuantity(adjustedQuantity, stepSize);
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    adjustedQuantity,
  };
}

export function validateNotional(
  price: number,
  quantity: number,
  filters: BinanceSymbolFilter[]
): FilterValidationResult {
  const errors: string[] = [];
  const notional = price * quantity;

  const minNotionalFilter = filters.find((f) => f.filterType === "MIN_NOTIONAL");
  if (minNotionalFilter) {
    const { minNotional } = minNotionalFilter;
    if (minNotional && notional < parseFloat(minNotional)) {
      errors.push(
        `Order notional ${notional.toFixed(2)} is below minimum ${minNotional}`
      );
    }
  }

  const notionalFilter = filters.find((f) => f.filterType === "NOTIONAL");
  if (notionalFilter) {
    const { minNotional, maxNotional } = notionalFilter;
    if (minNotional && notional < parseFloat(minNotional)) {
      errors.push(
        `Order notional ${notional.toFixed(2)} is below minimum ${minNotional}`
      );
    }
    if (maxNotional && notional > parseFloat(maxNotional)) {
      errors.push(
        `Order notional ${notional.toFixed(2)} is above maximum ${maxNotional}`
      );
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

export function validateAllFilters(
  price: number,
  quantity: number,
  filters: BinanceSymbolFilter[]
): FilterValidationResult {
  const priceValidation = validateAndAdjustPrice(price, filters);
  const quantityValidation = validateAndAdjustQuantity(quantity, filters);
  const notionalValidation = validateNotional(
    priceValidation.adjustedPrice || price,
    quantityValidation.adjustedQuantity || quantity,
    filters
  );

  const allErrors = [
    ...priceValidation.errors,
    ...quantityValidation.errors,
    ...notionalValidation.errors,
  ];

  return {
    isValid: allErrors.length === 0,
    errors: allErrors,
    adjustedPrice: priceValidation.adjustedPrice,
    adjustedQuantity: quantityValidation.adjustedQuantity,
  };
}
