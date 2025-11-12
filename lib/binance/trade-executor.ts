import { BinanceClient } from "./client";
import { validateAllFilters } from "./filters";
import { getUserApiKeys } from "@/lib/db/helpers";
import { decrypt } from "@/lib/encryption";
import { Signal, Trade } from "@/lib/db/models";
import { connectDB } from "@/lib/db";
import { BinanceAPIError, ValidationError } from "@/lib/utils/errors";
import { TRADE_DEFAULTS, TRADE_EXECUTION } from "@/lib/constants";
import { Types } from "mongoose";
import { calculatePositionSize, PositionSizingMethod } from "./position-sizing";
import { validateTradeRisk, getUserRiskLimits } from "./risk-manager";

interface TradeExecutionParams {
  userId: Types.ObjectId | unknown;
  signalId: Types.ObjectId;
  investmentAmount?: number;
  positionSizingMethod?: PositionSizingMethod;
  positionSizingPercentage?: number;
  positionSizingRiskPercent?: number;
  testnet?: boolean;
}

interface TradeExecutionResult {
  success: boolean;
  tradeId?: Types.ObjectId;
  buyOrder?: {
    symbol: string;
    orderId: number;
    executedQty: string;
    cummulativeQuoteQty: string;
    status: string;
    transactTime?: number;
    fills?: Array<{ price: string; qty: string; commission: string; commissionAsset: string }>;
  };
  error?: string;
  requiresApproval?: boolean;
}

export async function executeSignalTrade(
  params: TradeExecutionParams
): Promise<TradeExecutionResult> {
  const {
    userId: rawUserId,
    signalId,
    investmentAmount,
    positionSizingMethod = "fixed",
    positionSizingPercentage,
    positionSizingRiskPercent,
    testnet = false,
  } = params;

  try {
    await connectDB();

    const userId = rawUserId instanceof Types.ObjectId ? rawUserId : new Types.ObjectId(String(rawUserId));

    const signal = await Signal.findById(signalId);
    if (!signal) {
      throw new ValidationError("Signal not found");
    }

    if (signal.userId.toString() !== userId.toString()) {
      throw new ValidationError("Unauthorized access to signal");
    }

    if (signal.status !== "parsed") {
      throw new ValidationError(`Signal status must be 'parsed', got '${signal.status}'`);
    }

    const apiKeys = await getUserApiKeys(userId);
    if (!apiKeys || !("encryptedApiKey" in apiKeys) || !("encryptedApiSecret" in apiKeys) || !apiKeys.encryptedApiKey || !apiKeys.encryptedApiSecret) {
      throw new ValidationError("Binance API keys not configured");
    }

    const apiKey = decrypt(apiKeys.encryptedApiKey as string);
    const apiSecret = decrypt(apiKeys.encryptedApiSecret as string);

    const client = new BinanceClient({ apiKey, apiSecret, testnet });

    await client.syncServerTime();

    const exchangeInfo = await client.getExchangeInfo(signal.symbol);
    const symbolInfo = exchangeInfo.symbols.find((s) => s.symbol === signal.symbol);

    if (!symbolInfo) {
      throw new ValidationError(`Symbol ${signal.symbol} not found on Binance`);
    }

    if (symbolInfo.status !== "TRADING") {
      throw new ValidationError(`Symbol ${signal.symbol} is not trading (status: ${symbolInfo.status})`);
    }

    const ticker = await client.get24hrTicker(signal.symbol);
    const currentPrice = parseFloat(ticker.lastPrice);

    const accountInfo = await client.getAccount();
    const usdtBalance = parseFloat(
      accountInfo.balances.find((b) => b.asset === "USDT")?.free || "0"
    );

    const riskLimits = await getUserRiskLimits(userId);

    let amount: number;

    if (positionSizingMethod === "fixed") {
      amount = investmentAmount || TRADE_DEFAULTS.INVESTMENT_AMOUNT;
    } else {
      const positionSize = calculatePositionSize({
        method: positionSizingMethod,
        fixedAmount: investmentAmount,
        percentage: positionSizingPercentage,
        riskPercent: positionSizingRiskPercent,
        balance: usdtBalance,
        entryPrice: currentPrice,
        stopLoss: signal.stopLoss,
        maxPositionSize: riskLimits.maxPositionSize,
      });
      amount = positionSize.amount;
    }

    if (amount < TRADE_DEFAULTS.MIN_INVESTMENT || amount > TRADE_DEFAULTS.MAX_INVESTMENT) {
      throw new ValidationError(
        `Investment amount must be between ${TRADE_DEFAULTS.MIN_INVESTMENT} and ${TRADE_DEFAULTS.MAX_INVESTMENT} USDT`
      );
    }

    const riskCheck = await validateTradeRisk({
      userId,
      positionSize: amount,
      symbol: signal.symbol,
    });

    if (!riskCheck.allowed) {
      throw new ValidationError(riskCheck.reason || "Trade rejected by risk management");
    }

    if (riskLimits.requireApproval) {
      const trade = await Trade.create({
        userId,
        signalId,
        symbol: signal.symbol,
        buyOrder: {
          orderId: 0,
          symbol: signal.symbol,
          side: "BUY" as const,
          type: "MARKET" as const,
          quantity: 0,
          price: currentPrice,
          executedQty: 0,
          cummulativeQuoteQty: amount,
          status: "PENDING",
          timestamp: new Date(),
        },
        entryPrice: currentPrice,
        quantity: 0,
        investedAmount: amount,
        status: "pending_approval",
        approvalStatus: "pending",
        targets: signal.targets,
        stopLoss: signal.stopLoss,
      });

      signal.status = "executing";
      await signal.save();

      return {
        success: true,
        tradeId: trade._id,
        requiresApproval: true,
      };
    }

    const estimatedQuantity = amount / currentPrice;
    const filters = symbolInfo.filters;

    const validation = validateAllFilters(currentPrice, estimatedQuantity, filters);
    if (!validation.isValid) {
      throw new ValidationError(`Filter validation failed: ${validation.errors.join(", ")}`);
    }

    signal.status = "executing";
    await signal.save();

    const buyOrder = await client.createMarketBuyOrder(signal.symbol, amount);

    const executedQty = parseFloat(buyOrder.executedQty || "0");
    const executedPrice = parseFloat(buyOrder.fills?.[0]?.price || "0");

    const trade = await Trade.create({
      userId,
      signalId,
      symbol: signal.symbol,
      buyOrder: {
        orderId: buyOrder.orderId,
        symbol: buyOrder.symbol,
        side: "BUY" as const,
        type: "MARKET" as const,
        quantity: executedQty,
        price: executedPrice,
        executedQty: executedQty,
        cummulativeQuoteQty: parseFloat(buyOrder.cummulativeQuoteQty || "0"),
        status: buyOrder.status,
        timestamp: new Date(buyOrder.transactTime || Date.now()),
      },
      entryPrice: executedPrice,
      quantity: executedQty,
      investedAmount: amount,
      status: "open",
      targets: signal.targets,
      stopLoss: signal.stopLoss,
    });

    // Don't mark signal as completed yet - wait for OCO orders to fill
    signal.status = "executing";
    await signal.save();

    return {
      success: true,
      tradeId: trade._id,
      buyOrder,
    };
  } catch (error) {
    await Signal.findByIdAndUpdate(signalId, { status: "failed" });

    if (error instanceof BinanceAPIError || error instanceof ValidationError) {
      return {
        success: false,
        error: error.message,
      };
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

interface OCOOrderResult {
  orderId: number;
  status: string;
  transactTime?: number;
}

/**
 * Helper function for retry with exponential backoff
 * Used to handle settlement delays on testnet
 */
async function retryOCOCreation<T>(
  fn: () => Promise<T>,
  symbol: string,
  maxRetries: number = TRADE_EXECUTION.OCO_RETRY_MAX_ATTEMPTS,
  baseDelay: number = TRADE_EXECUTION.OCO_RETRY_BASE_DELAY_MS
): Promise<T> {
  const startTime = Date.now();
  const MAX_TOTAL_DURATION = TRADE_EXECUTION.OCO_RETRY_MAX_TOTAL_DURATION_MS;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const elapsed = Date.now() - startTime;

    // Check if total time exceeded
    if (elapsed > MAX_TOTAL_DURATION) {
      console.error(`[OCO] ${symbol} - Timeout after ${elapsed}ms (max: ${MAX_TOTAL_DURATION}ms)`);
      throw new Error(
        `OCO creation timeout for ${symbol} - exceeded maximum duration of ${MAX_TOTAL_DURATION}ms. ` +
        `This may indicate persistent settlement delays on testnet.`
      );
    }

    try {
      console.log(`[OCO] ${symbol} - Attempt ${attempt}/${maxRetries} (elapsed: ${elapsed}ms)`);
      const result = await fn();
      console.log(`[OCO] ${symbol} - Success on attempt ${attempt} (total time: ${Date.now() - startTime}ms)`);
      return result;
    } catch (error: unknown) {
      const isInsufficientBalance =
        error instanceof BinanceAPIError && error.binanceCode === -2010;
      const isLastAttempt = attempt === maxRetries;

      if (isInsufficientBalance && !isLastAttempt) {
        const delay = baseDelay * Math.pow(2, attempt - 1); // Exponential backoff: 2s, 4s, 8s
        console.warn(
          `[OCO] ${symbol} - Insufficient balance on attempt ${attempt}/${maxRetries}. ` +
          `Retrying in ${delay}ms... (elapsed: ${elapsed}ms)`
        );
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      // Log final error with full context
      console.error(
        `[OCO] ${symbol} - Failed on attempt ${attempt}/${maxRetries}:`,
        error instanceof BinanceAPIError
          ? `Binance error ${error.binanceCode}: ${error.message}`
          : error instanceof Error
          ? error.message
          : 'Unknown error'
      );
      throw error;
    }
  }

  // This should never be reached, but TypeScript needs it
  throw new Error('Retry logic failed unexpectedly');
}

export async function createOCOOrders(
  tradeId: Types.ObjectId,
  testnet = false
): Promise<{ success: boolean; orders?: OCOOrderResult[]; error?: string }> {
  try {
    await connectDB();

    const trade = await Trade.findById(tradeId);
    if (!trade) {
      throw new ValidationError("Trade not found");
    }

    const apiKeys = await getUserApiKeys(trade.userId);
    if (!apiKeys || !("encryptedApiKey" in apiKeys) || !("encryptedApiSecret" in apiKeys) || !apiKeys.encryptedApiKey || !apiKeys.encryptedApiSecret) {
      throw new ValidationError("Binance API keys not configured");
    }

    const apiKey = decrypt(apiKeys.encryptedApiKey as string);
    const apiSecret = decrypt(apiKeys.encryptedApiSecret as string);
    const client = new BinanceClient({ apiKey, apiSecret, testnet });

    const exchangeInfo = await client.getExchangeInfo(trade.symbol);
    const symbolInfo = exchangeInfo.symbols.find((s) => s.symbol === trade.symbol);

    if (!symbolInfo) {
      throw new ValidationError(`Symbol ${trade.symbol} not found`);
    }

    const filters = symbolInfo.filters;
    const distribution = TRADE_DEFAULTS.TARGET_DISTRIBUTION; // [75, 15, 10]
    const maxOCOOrders = distribution.length; // Limit to 3 OCO orders
    const targets = trade.targets.slice(0, maxOCOOrders); // Take only first 3 targets
    const orders: OCOOrderResult[] = [];

    // Verify balance before creating OCO orders
    console.log(`[OCO] ${trade.symbol} - Fetching account balance for verification...`);
    const accountInfo = await client.getAccount();

    // Use baseAsset from symbol info instead of string replace
    const baseAsset = symbolInfo.baseAsset;
    if (!baseAsset) {
      throw new ValidationError(`Unable to determine base asset for ${trade.symbol}`);
    }

    const assetBalance = accountInfo.balances.find(b => b.asset === baseAsset);
    const availableBalance = parseFloat(assetBalance?.free || '0');
    const lockedBalance = parseFloat(assetBalance?.locked || '0');

    console.log(
      `[OCO] ${trade.symbol} - Balance check for ${baseAsset}:`,
      `Available=${availableBalance.toFixed(8)},`,
      `Locked=${lockedBalance.toFixed(8)},`,
      `Required=${trade.quantity.toFixed(8)},`,
      `Shortfall=${Math.max(0, trade.quantity - availableBalance).toFixed(8)}`
    );

    // Add floating point tolerance for balance comparison
    if (availableBalance < trade.quantity - TRADE_EXECUTION.BALANCE_TOLERANCE) {
      const shortfall = trade.quantity - availableBalance;
      throw new ValidationError(
        `Insufficient ${baseAsset} balance for OCO orders. ` +
        `Required: ${trade.quantity.toFixed(8)}, Available: ${availableBalance.toFixed(8)}, ` +
        `Shortfall: ${shortfall.toFixed(8)}. ` +
        `This may indicate a settlement delay on testnet. ` +
        `The balance will be retried with exponential backoff.`
      );
    }

    console.log(`[OCO] ${trade.symbol} - Balance verification passed, proceeding with OCO creation`);


    // Log warning if signal has more targets than distribution
    if (trade.targets.length > maxOCOOrders) {
      console.warn(
        `Signal has ${trade.targets.length} targets, but only ${maxOCOOrders} will be used ` +
        `for OCO orders (distribution: ${distribution.join(", ")}%). ` +
        `Skipping targets: ${trade.targets.slice(maxOCOOrders).join(", ")}`
      );
    }

    let totalAllocatedQty = 0;

    for (let i = 0; i < targets.length; i++) {
      const targetPrice = targets[i];
      const percentage = distribution[i]; // Safe - always within bounds (no fallback needed)
      const qtyForTarget = (trade.quantity * percentage) / 100;

      // Validate and adjust target price and quantity
      const validation = validateAllFilters(targetPrice, qtyForTarget, filters);
      if (!validation.isValid) {
        console.warn(`Skipping target ${i} due to filter validation: ${validation.errors.join(", ")}`);
        continue;
      }

      const adjustedQty = validation.adjustedQuantity || qtyForTarget;
      const adjustedPrice = validation.adjustedPrice || targetPrice;

      // Validate and adjust stop loss price
      const stopPriceValidation = validateAllFilters(trade.stopLoss, adjustedQty, filters);
      const adjustedStopPrice = stopPriceValidation.adjustedPrice || trade.stopLoss;

      // Calculate and validate stop limit price (0.5% below stop loss for sell orders)
      const rawStopLimitPrice = adjustedStopPrice * 0.995;
      const stopLimitValidation = validateAllFilters(rawStopLimitPrice, adjustedQty, filters);
      const adjustedStopLimitPrice = stopLimitValidation.adjustedPrice || rawStopLimitPrice;

      // eslint-disable-next-line no-console
      console.log(`Creating OCO for target ${i}:`, {
        symbol: trade.symbol,
        targetPrice: targetPrice,
        adjustedPrice: adjustedPrice,
        quantity: qtyForTarget.toFixed(8),
        adjustedQty: adjustedQty.toFixed(8),
        stopLoss: trade.stopLoss,
        adjustedStopPrice: adjustedStopPrice,
        rawStopLimitPrice: rawStopLimitPrice,
        adjustedStopLimitPrice: adjustedStopLimitPrice,
      });

      try {
        // Use retry logic for OCO creation (handles testnet settlement delays)
        const ocoOrder = await retryOCOCreation(
          () => client.createOCOOrder(
            trade.symbol,
            adjustedQty,
            adjustedPrice,
            adjustedStopPrice,
            adjustedStopLimitPrice
          ),
          trade.symbol // Pass symbol for logging
        );

        orders.push({
          orderId: ocoOrder.orderId,
          status: ocoOrder.status,
          transactTime: ocoOrder.transactTime,
        });
        totalAllocatedQty += adjustedQty;

        trade.sellOrders.push({
          orderId: ocoOrder.orderId,
          symbol: trade.symbol,
          side: "SELL" as const,
          type: "OCO" as const,
          quantity: adjustedQty,
          price: adjustedPrice,
          stopPrice: trade.stopLoss,
          executedQty: 0,
          cummulativeQuoteQty: 0,
          status: ocoOrder.status,
          timestamp: new Date(ocoOrder.transactTime || Date.now()),
        });
      } catch (error) {
        console.error(`Failed to create OCO for target ${i}:`, error);
      }
    }

    // Validate that allocated quantity matches buy quantity
    const unallocatedQty = trade.quantity - totalAllocatedQty;
    const allocationPercentage = (totalAllocatedQty / trade.quantity) * 100;

    if (Math.abs(unallocatedQty) > 0.00000001) { // Floating point tolerance
      console.warn(
        `OCO allocation mismatch for ${trade.symbol}:`,
        {
          buyQuantity: trade.quantity.toFixed(8),
          allocatedQuantity: totalAllocatedQty.toFixed(8),
          unallocatedQuantity: unallocatedQty.toFixed(8),
          allocationPercentage: allocationPercentage.toFixed(2) + '%',
          successfulOrders: orders.length,
          totalTargets: trade.targets.length,
        }
      );
    }

    // Ensure at least one OCO order was created
    if (orders.length === 0) {
      throw new ValidationError(
        `Failed to create any OCO orders for ${trade.symbol}. ` +
        `All ${trade.targets.length} target(s) failed filter validation. ` +
        `Check signal prices against Binance exchange filters.`
      );
    }

    await trade.save();

    return {
      success: true,
      orders,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
