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

/**
 * Validate PERCENT_PRICE_BY_SIDE filter
 * Ensures order price is within allowed percentage range of market price
 *
 * @param orderPrice - The price of the order being placed
 * @param currentMarketPrice - Current market price (last traded price or weighted avg)
 * @param side - Order side (BUY or SELL)
 * @param filters - Exchange filters for the symbol
 * @returns Validation result with errors if price violates filter
 */
export function validatePercentPriceBySide(
  orderPrice: number,
  currentMarketPrice: number,
  side: "BUY" | "SELL",
  filters: BinanceSymbolFilter[]
): FilterValidationResult {
  const errors: string[] = [];

  const percentPriceFilter = filters.find((f) => f.filterType === "PERCENT_PRICE_BY_SIDE");
  if (!percentPriceFilter) {
    // Filter not present - validation passes
    return { isValid: true, errors: [] };
  }

  const {
    bidMultiplierUp,
    bidMultiplierDown,
    askMultiplierUp,
    askMultiplierDown,
  } = percentPriceFilter;

  if (side === "BUY") {
    // For BUY orders: check against bid multipliers
    if (bidMultiplierUp) {
      const maxAllowedPrice = currentMarketPrice * parseFloat(bidMultiplierUp);
      if (orderPrice > maxAllowedPrice) {
        const percentAbove = ((orderPrice / currentMarketPrice - 1) * 100).toFixed(2);
        errors.push(
          `Buy order price ${orderPrice.toFixed(8)} is too high. ` +
          `Maximum allowed: ${maxAllowedPrice.toFixed(8)} ` +
          `(${percentAbove}% above market price ${currentMarketPrice.toFixed(8)})`
        );
      }
    }

    if (bidMultiplierDown) {
      const minAllowedPrice = currentMarketPrice * parseFloat(bidMultiplierDown);
      if (orderPrice < minAllowedPrice) {
        const percentBelow = ((1 - orderPrice / currentMarketPrice) * 100).toFixed(2);
        errors.push(
          `Buy order price ${orderPrice.toFixed(8)} is too low. ` +
          `Minimum allowed: ${minAllowedPrice.toFixed(8)} ` +
          `(${percentBelow}% below market price ${currentMarketPrice.toFixed(8)})`
        );
      }
    }
  } else if (side === "SELL") {
    // For SELL orders: check against ask multipliers
    if (askMultiplierUp) {
      const maxAllowedPrice = currentMarketPrice * parseFloat(askMultiplierUp);
      if (orderPrice > maxAllowedPrice) {
        const percentAbove = ((orderPrice / currentMarketPrice - 1) * 100).toFixed(2);
        errors.push(
          `Sell order price ${orderPrice.toFixed(8)} is too high. ` +
          `Maximum allowed: ${maxAllowedPrice.toFixed(8)} ` +
          `(${percentAbove}% above market price ${currentMarketPrice.toFixed(8)})`
        );
      }
    }

    if (askMultiplierDown) {
      const minAllowedPrice = currentMarketPrice * parseFloat(askMultiplierDown);
      if (orderPrice < minAllowedPrice) {
        const percentBelow = ((1 - orderPrice / currentMarketPrice) * 100).toFixed(2);
        errors.push(
          `Sell order price ${orderPrice.toFixed(8)} is too low. ` +
          `Minimum allowed: ${minAllowedPrice.toFixed(8)} ` +
          `(${percentBelow}% below market price ${currentMarketPrice.toFixed(8)})`
        );
      }
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

/**
 * Validate OCO order prices against all filters including PERCENT_PRICE_BY_SIDE
 *
 * @param takeProfitPrice - Price for the take profit (LIMIT_MAKER) order
 * @param stopPrice - Stop price for the stop loss order
 * @param stopLimitPrice - Limit price for the stop loss order
 * @param quantity - Order quantity
 * @param currentMarketPrice - Current market price
 * @param filters - Exchange filters for the symbol
 * @returns Validation result with detailed errors
 */
export function validateOCOFilters(
  takeProfitPrice: number,
  stopPrice: number,
  stopLimitPrice: number,
  quantity: number,
  currentMarketPrice: number,
  filters: BinanceSymbolFilter[]
): FilterValidationResult {
  const errors: string[] = [];

  // Validate take profit price (SELL order above market)
  const tpValidation = validatePercentPriceBySide(
    takeProfitPrice,
    currentMarketPrice,
    "SELL",
    filters
  );
  errors.push(...tpValidation.errors.map(e => `Take Profit: ${e}`));

  // Validate stop price (SELL order below market)
  const stopValidation = validatePercentPriceBySide(
    stopPrice,
    currentMarketPrice,
    "SELL",
    filters
  );
  errors.push(...stopValidation.errors.map(e => `Stop Loss: ${e}`));

  // Validate stop limit price (SELL order below market)
  const stopLimitValidation = validatePercentPriceBySide(
    stopLimitPrice,
    currentMarketPrice,
    "SELL",
    filters
  );
  errors.push(...stopLimitValidation.errors.map(e => `Stop Limit: ${e}`));

  // Also run standard filter validation
  const tpStandardValidation = validateAllFilters(takeProfitPrice, quantity, filters);
  const stopStandardValidation = validateAllFilters(stopPrice, quantity, filters);
  const stopLimitStandardValidation = validateAllFilters(stopLimitPrice, quantity, filters);

  errors.push(
    ...tpStandardValidation.errors,
    ...stopStandardValidation.errors,
    ...stopLimitStandardValidation.errors
  );

  return {
    isValid: errors.length === 0,
    errors,
  };
}
