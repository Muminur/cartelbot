import { BinanceClient } from "./client";
import { validateAllFilters, validateOCOFilters } from "./filters";
import { getUserApiKeys } from "@/lib/db/helpers";
import { decrypt } from "@/lib/encryption";
import { Signal, Trade } from "@/lib/db/models";
import { connectDB } from "@/lib/db";
import { BinanceAPIError, ValidationError } from "@/lib/utils/errors";
import { TRADE_DEFAULTS, TRADE_EXECUTION } from "@/lib/constants";
import { Types } from "mongoose";
import { calculatePositionSize, PositionSizingMethod } from "./position-sizing";
import { validateTradeRisk, getUserRiskLimits } from "./risk-manager";
import { categorizeError, formatErrorCode } from "@/lib/utils/error-categorization";
import { sendTargetAdjustmentNotification } from "@/lib/email/notifications";

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
        testnet,
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

    // CRITICAL: Capture pre-buy balance for settlement verification in createOCOOrders()
    // This is captured BEFORE the buy order executes, so we can detect settlement completion
    const baseAsset = symbolInfo.baseAsset || signal.symbol.replace(/USDT$/, '');
    const preBuyAccountInfo = await client.getAccount();
    const preBuyAssetBalance = preBuyAccountInfo.balances.find(b => b.asset === baseAsset);
    const preBuyBalance = parseFloat(preBuyAssetBalance?.free || '0');

    if (process.env.NODE_ENV !== 'production') console.log(`[Trade Executor] Executing buy order for ${signal.symbol}:`, {
      symbol: signal.symbol,
      investmentAmount: amount,
      estimatedQuantity: estimatedQuantity,
      currentPrice: currentPrice,
      testnet: testnet,
      baseAsset: baseAsset,
      preBuyBalance: preBuyBalance.toFixed(8),
      note: "Pre-buy balance will be used for settlement verification in createOCOOrders()",
    });

    const buyOrder = await client.createMarketBuyOrder(signal.symbol, amount);

    if (process.env.NODE_ENV !== 'production') console.log(`[Trade Executor] Buy order executed successfully:`, {
      orderId: buyOrder.orderId,
      symbol: buyOrder.symbol,
      status: buyOrder.status,
      executedQty: buyOrder.executedQty,
      cummulativeQuoteQty: buyOrder.cummulativeQuoteQty,
      fills: buyOrder.fills?.map(f => ({
        price: f.price,
        qty: f.qty,
        commission: f.commission,
        commissionAsset: f.commissionAsset,
      })),
      transactTime: buyOrder.transactTime,
    });

    const executedQty = parseFloat(buyOrder.executedQty || "0");
    const executedPrice = parseFloat(buyOrder.fills?.[0]?.price || "0");

    if (executedQty === 0) {
      throw new ValidationError(
        `Buy order executed with 0 quantity. Order ID: ${buyOrder.orderId}. ` +
        `This may indicate an order rejection or API issue.`
      );
    }

    if (process.env.NODE_ENV !== 'production') console.log(`[Trade Executor] Buy order processed:`, {
      executedQuantity: executedQty,
      executedPrice: executedPrice,
      totalCost: parseFloat(buyOrder.cummulativeQuoteQty || "0"),
    });

    // CRITICAL FIX: Store ORIGINAL targets - filtering will happen in createOCOOrders()
    // This prevents race condition where price changes between buy order and OCO creation
    if (process.env.NODE_ENV !== 'production') console.log(`[Trade Executor] Storing ORIGINAL targets for ${signal.symbol}:`, {
      targets: signal.targets.map((t: number) => t.toFixed(8)),
      stopLoss: signal.stopLoss,
      note: "Target filtering will occur in createOCOOrders() with fresh market price",
    });

    // Basic validation: stop loss must be below executed price
    if (signal.stopLoss >= executedPrice) {
      throw new ValidationError(
        `Stop loss (${signal.stopLoss.toFixed(8)}) must be BELOW entry price (${executedPrice.toFixed(8)}) for sell orders. ` +
        `This indicates the signal's stop loss is incorrectly positioned or the market moved significantly.`
      );
    }

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
        fills: buyOrder.fills?.map(f => ({
          price: f.price,
          qty: f.qty,
          commission: f.commission,
          commissionAsset: f.commissionAsset,
        })),
      },
      entryPrice: executedPrice,
      quantity: executedQty,
      investedAmount: amount,
      status: "open",
      testnet,
      targets: signal.targets, // Store ORIGINAL targets from signal
      stopLoss: signal.stopLoss, // Store ORIGINAL stop loss from signal
      targetAdjustmentNotificationSent: false, // Flag for notification system
      preBuyBalance: preBuyBalance, // CRITICAL: Balance before buy order for settlement verification
    });

    if (process.env.NODE_ENV !== 'production') console.log(`[Trade Executor] Trade document created:`, {
      tradeId: trade._id,
      symbol: trade.symbol,
      quantity: trade.quantity,
      entryPrice: trade.entryPrice,
      investedAmount: trade.investedAmount,
      status: trade.status,
      targets: signal.targets.map((t: number) => t.toFixed(8)),
      stopLoss: signal.stopLoss,
      note: "Targets will be validated and adjusted in createOCOOrders() if needed",
    });

    // Don't mark signal as completed yet - wait for OCO orders to fill
    signal.status = "executing";
    await signal.save();

    if (process.env.NODE_ENV !== 'production') console.log(`[Trade Executor] Trade execution successful - ready for OCO creation`, {
      tradeId: trade._id,
      executedQuantity: executedQty,
      symbol: signal.symbol,
    });

    return {
      success: true,
      tradeId: trade._id,
      buyOrder,
    };
  } catch (error) {
    console.error(`[Trade Executor] Trade execution failed:`, {
      signalId: signalId,
      error: error instanceof Error ? error.message : "Unknown error",
      errorType: error instanceof BinanceAPIError ? "BinanceAPIError" :
                 error instanceof ValidationError ? "ValidationError" : "Unknown",
      binanceCode: error instanceof BinanceAPIError ? error.binanceCode : undefined,
    });

    // Store detailed error information in Signal model
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    const errorCode = formatErrorCode(error);
    const failureReason = categorizeError(error);

    await Signal.findByIdAndUpdate(signalId, {
      status: "failed",
      executionError: errorMessage,
      executionErrorCode: errorCode,
      executionErrorTimestamp: new Date(),
      failureReason: failureReason,
    });

    if (process.env.NODE_ENV !== 'production') console.log(`[Trade Executor] Signal ${signalId} marked as failed:`, {
      errorCode,
      failureReason,
      errorMessage: errorMessage.substring(0, 100),
    });

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
  balanceCheckFn?: () => Promise<{ available: number; required: number }>,
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
      if (process.env.NODE_ENV !== 'production') console.log(`[OCO] ${symbol} - Attempt ${attempt}/${maxRetries} (elapsed: ${elapsed}ms)`);

      // Optional balance check on retry attempts (diagnostic)
      // Note: Balance already verified before OCO loop starts, this is for diagnostics during retries
      if (balanceCheckFn && attempt > 1) {
        const balanceCheck = await balanceCheckFn();
        if (process.env.NODE_ENV !== 'production') console.log(
          `[OCO] ${symbol} - Balance diagnostic on retry ${attempt - 1}:`,
          `Available=${balanceCheck.available.toFixed(8)},`,
          `Required=${balanceCheck.required.toFixed(8)},`,
          `Shortfall=${Math.max(0, balanceCheck.required - balanceCheck.available).toFixed(8)}`
        );
      }

      const result = await fn();
      if (process.env.NODE_ENV !== 'production') console.log(`[OCO] ${symbol} - Success on attempt ${attempt} (total time: ${Date.now() - startTime}ms)`);
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

    if (process.env.NODE_ENV !== 'production') console.log(`[OCO Creation] Starting OCO order creation:`, {
      tradeId: trade._id,
      symbol: trade.symbol,
      buyQuantity: trade.quantity,
      entryPrice: trade.entryPrice,
      targets: trade.targets,
      targetsAdjusted: trade.targetAdjustmentReason !== undefined,
      adjustmentReason: trade.targetAdjustmentReason || "None",
      stopLoss: trade.stopLoss,
      testnet: testnet,
    });

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

    // CRITICAL: Fetch CURRENT market price for target validation
    // This prevents race condition - price may have changed since buy order
    const ticker = await client.get24hrTicker(trade.symbol);
    const currentPrice = parseFloat(ticker.lastPrice);

    if (process.env.NODE_ENV !== 'production') console.log(`[OCO Creation] Current market state for ${trade.symbol}:`, {
      currentPrice: currentPrice.toFixed(8),
      entryPrice: trade.entryPrice.toFixed(8),
      priceDifference: ((currentPrice - trade.entryPrice) / trade.entryPrice * 100).toFixed(2) + '%',
      originalTargets: trade.targets.map((t: number) => t.toFixed(8)),
      originalStopLoss: trade.stopLoss,
    });

    // CRITICAL: Filter targets against CURRENT price (not entry price)
    // Binance OCO rule for SELL: price > market price > stopPrice
    const originalTargets = [...trade.targets];
    const validTargets = trade.targets.filter((target: number) => target > currentPrice);
    const invalidTargets = trade.targets.filter((target: number) => target <= currentPrice);

    if (process.env.NODE_ENV !== 'production') console.log(`[OCO Creation] Target validation for ${trade.symbol}:`, {
      currentPrice: currentPrice.toFixed(8),
      validTargets: validTargets.map((t: number) => t.toFixed(8)),
      invalidTargets: invalidTargets.map((t: number) => t.toFixed(8)),
      filteredCount: invalidTargets.length,
    });

    // Handle case where market moved above ALL targets
    let adjustedTargets: number[] = validTargets;
    let adjustedStopLoss = trade.stopLoss;
    let targetAdjustmentReason: string | undefined;

    if (validTargets.length === 0) {
      // Market moved above all targets - create emergency profit target
      console.warn(
        `[OCO Creation] ${trade.symbol} - Market moved above ALL ${originalTargets.length} target(s). ` +
        `Creating emergency profit target...`
      );

      // Try 1.5% emergency target first (configurable via TRADE_EXECUTION)
      let emergencyTarget = currentPrice * (1 + TRADE_EXECUTION.EMERGENCY_TARGET_PERCENTAGE);

      // Validate emergency target against Binance filters
      const emergencyValidation = validateAllFilters(emergencyTarget, trade.quantity, filters);

      if (!emergencyValidation.isValid) {
        console.warn(
          `[OCO Creation] ${trade.symbol} - Emergency target ${emergencyTarget.toFixed(8)} failed filter validation: ` +
          `${emergencyValidation.errors.join(", ")}. Trying fallback 1% target...`
        );

        // Fallback to 1% minimum if 1.5% fails filters
        emergencyTarget = currentPrice * (1 + TRADE_EXECUTION.MIN_EMERGENCY_TARGET_PERCENTAGE);
        const fallbackValidation = validateAllFilters(emergencyTarget, trade.quantity, filters);

        if (!fallbackValidation.isValid) {
          throw new ValidationError(
            `Emergency profit target creation failed for ${trade.symbol}. ` +
            `Both 1.5% (${(currentPrice * 1.015).toFixed(8)}) and 1% (${(currentPrice * 1.01).toFixed(8)}) ` +
            `targets failed Binance filter validation: ${fallbackValidation.errors.join(", ")}. ` +
            `This indicates the symbol's price filters are too restrictive for emergency targets. ` +
            `Consider using a different entry strategy or symbol.`
          );
        }

        // Use fallback 1% target with adjusted price if needed
        emergencyTarget = fallbackValidation.adjustedPrice || emergencyTarget;
        if (process.env.NODE_ENV !== 'production') console.log(
          `[OCO Creation] ${trade.symbol} - Using fallback 1% emergency target: ${emergencyTarget.toFixed(8)} ` +
          `(adjusted from filters: ${fallbackValidation.adjustedPrice ? 'YES' : 'NO'})`
        );
      } else {
        // Use 1.5% target with adjusted price if needed
        emergencyTarget = emergencyValidation.adjustedPrice || emergencyTarget;
        if (process.env.NODE_ENV !== 'production') console.log(
          `[OCO Creation] ${trade.symbol} - Using 1.5% emergency target: ${emergencyTarget.toFixed(8)} ` +
          `(adjusted from filters: ${emergencyValidation.adjustedPrice ? 'YES' : 'NO'})`
        );
      }

      adjustedTargets = [emergencyTarget];

      // CRITICAL: Also adjust stop loss to max 2% loss when using emergency target
      // Use the HIGHER of: original stop loss OR emergency stop loss (never widen the stop)
      const emergencyStopLoss = currentPrice * (1 - TRADE_EXECUTION.EMERGENCY_STOP_LOSS_PERCENTAGE);
      const originalStopLoss = trade.stopLoss;

      if (emergencyStopLoss > originalStopLoss) {
        adjustedStopLoss = emergencyStopLoss;
        if (process.env.NODE_ENV !== 'production') console.log(
          `[OCO Creation] ${trade.symbol} - Emergency stop loss applied: ` +
          `${emergencyStopLoss.toFixed(8)} (2% max loss) vs original ${originalStopLoss.toFixed(8)}. ` +
          `Using TIGHTER stop loss: ${adjustedStopLoss.toFixed(8)}`
        );
      } else {
        adjustedStopLoss = originalStopLoss;
        if (process.env.NODE_ENV !== 'production') console.log(
          `[OCO Creation] ${trade.symbol} - Original stop loss ${originalStopLoss.toFixed(8)} ` +
          `is already tighter than emergency stop loss ${emergencyStopLoss.toFixed(8)}. Keeping original.`
        );
      }

      targetAdjustmentReason =
        `Market moved above all ${originalTargets.length} original target(s). ` +
        `Created emergency profit target at +${(TRADE_EXECUTION.EMERGENCY_TARGET_PERCENTAGE * 100).toFixed(1)}% ` +
        `(${emergencyTarget.toFixed(8)}) above current price (${currentPrice.toFixed(8)}). ` +
        `${adjustedStopLoss !== originalStopLoss ?
          `Adjusted stop loss to ${adjustedStopLoss.toFixed(8)} (max 2% loss).` :
          `Original stop loss maintained at ${originalStopLoss.toFixed(8)}.`}`;

      console.warn(`[OCO Creation] ${trade.symbol} - ${targetAdjustmentReason}`);

      // Store adjustment reason in Trade document for user notification
      trade.targetAdjustmentReason = targetAdjustmentReason;
    } else if (invalidTargets.length > 0) {
      // Market moved above some targets - use remaining valid targets
      targetAdjustmentReason =
        `Market moved above ${invalidTargets.length} of ${originalTargets.length} target(s). ` +
        `Using ${validTargets.length} remaining valid target(s) above current price.`;

      console.warn(`[OCO Creation] ${trade.symbol} - ${targetAdjustmentReason}`);

      // Store adjustment reason in Trade document for user notification
      trade.targetAdjustmentReason = targetAdjustmentReason;
    }

    // Validate stop loss is below current price
    if (adjustedStopLoss >= currentPrice) {
      throw new ValidationError(
        `Stop loss (${adjustedStopLoss.toFixed(8)}) must be BELOW current price (${currentPrice.toFixed(8)}) for sell orders. ` +
        `This indicates the market moved significantly or stop loss is incorrectly positioned.`
      );
    }

    const targets = adjustedTargets; // Use adjusted targets (filtered or emergency)
    const orders: OCOOrderResult[] = [];

    // Get user's risk limits (includes custom targetDistribution)
    const riskLimits = await getUserRiskLimits(trade.userId);

    // Calculate distribution percentages for all targets
    // Use user's custom distribution from settings, or fall back to default [75, 15, 10]
    const userDistribution = riskLimits.targetDistribution; // From user settings or default [75, 15, 10]
    let distribution: number[];

    if (process.env.NODE_ENV !== 'production') console.log(
      `[OCO] ${trade.symbol} - User's target distribution setting: ${userDistribution.join(", ")}%`,
      `(${userDistribution.length} values for ${targets.length} targets)`
    );

    // CRITICAL: Handle distribution length vs target count mismatch
    if (targets.length === userDistribution.length) {
      // Perfect match - use as-is (validation already ensures sum is 100%)
      distribution = userDistribution;
      if (process.env.NODE_ENV !== 'production') console.log(`[OCO] ${trade.symbol} - Distribution length matches target count - using as-is`);
    } else if (targets.length < userDistribution.length) {
      // Fewer targets than distribution values - slice and normalize to 100%
      // Example: 3 targets but distribution is [75, 15, 10] → use [75, 15, 10]
      // Example: 2 targets but distribution is [75, 15, 10] → use [75, 15] → normalize to [83.33, 16.67]
      const baseDist = userDistribution.slice(0, targets.length);
      const sum = baseDist.reduce((a, b) => a + b, 0);

      if (Math.abs(sum - 100) < 0.01) {
        // Already sums to 100% (within tolerance)
        distribution = baseDist;
        if (process.env.NODE_ENV !== 'production') console.log(
          `[OCO] ${trade.symbol} - Sliced distribution already sums to 100%: ${baseDist.join(", ")}%`
        );
      } else {
        // Normalize to 100%
        distribution = baseDist.map((pct) => (pct / sum) * 100);
        if (process.env.NODE_ENV !== 'production') console.log(
          `[OCO] ${trade.symbol} - Normalized sliced distribution from ${baseDist.join(", ")}% ` +
          `(sum=${sum.toFixed(2)}%) to ${distribution.map((d) => d.toFixed(2)).join(", ")}%`
        );
      }
    } else {
      // More targets than distribution values - distribute equally
      // Example: 5 targets but distribution is [75, 15, 10] → use [20, 20, 20, 20, 20]
      const percentagePerTarget = 100 / targets.length;
      distribution = Array(targets.length).fill(percentagePerTarget);
      if (process.env.NODE_ENV !== 'production') console.log(
        `[OCO] ${trade.symbol} - More targets than distribution values ` +
        `(${targets.length} > ${userDistribution.length}). Using equal distribution: ` +
        `${percentagePerTarget.toFixed(2)}% per target`
      );
    }

    if (process.env.NODE_ENV !== 'production') console.log(
      `[OCO] ${trade.symbol} - Final distribution for ${targets.length} targets: ` +
      `${distribution.map((d) => d.toFixed(2)).join(", ")}% (sum=${distribution.reduce((a, b) => a + b, 0).toFixed(2)}%)`
    );

    // Use baseAsset from symbol info with fallback to string parsing
    const baseAsset = symbolInfo.baseAsset || trade.symbol.replace(/USDT$/, '');
    if (!baseAsset) {
      throw new ValidationError(`Unable to determine base asset for ${trade.symbol}`);
    }

    // Initial balance check (will be updated if additional settlement delay needed)
    if (process.env.NODE_ENV !== 'production') console.log(`[OCO] ${trade.symbol} - Initial balance check for ${baseAsset}...`);
    const initialAccountInfo = await client.getAccount();
    const initialAssetBalance = initialAccountInfo.balances.find(b => b.asset === baseAsset);
    const currentAvailableBalance = parseFloat(initialAssetBalance?.free || '0'); // Current balance (may already include settlement)
    const initialLockedBalance = parseFloat(initialAssetBalance?.locked || '0');

    // DIAGNOSTIC: Log raw Binance API response to verify field values
    if (process.env.NODE_ENV !== 'production') console.log(
      `[OCO] ${trade.symbol} - RAW Binance API balance response for ${baseAsset}:`,
      `free="${initialAssetBalance?.free || '0'}" (parsed: ${currentAvailableBalance.toFixed(8)}),`,
      `locked="${initialAssetBalance?.locked || '0'}" (parsed: ${initialLockedBalance.toFixed(8)}),`,
      `NOTE: "free" field already EXCLUDES locked balance - it is truly available for trading`
    );

    // CRITICAL FIX: Use preBuyBalance from Trade document (captured BEFORE buy order)
    // If not available (old trades), fall back to current balance (assumes no settlement yet)
    const preBuyBalance = trade.preBuyBalance !== undefined
      ? trade.preBuyBalance
      : currentAvailableBalance;

    if (process.env.NODE_ENV !== 'production') console.log(
      `[OCO] ${trade.symbol} - Initial balance:`,
      `PreBuy=${preBuyBalance.toFixed(8)},`,
      `Current=${currentAvailableBalance.toFixed(8)},`,
      `Locked=${initialLockedBalance.toFixed(8)},`,
      `Required (from buy order)=${trade.quantity.toFixed(8)},`,
      `Buy Order ID=${trade.buyOrder?.orderId || 'N/A'},`,
      `Buy Order Executed Qty=${trade.buyOrder?.executedQty?.toFixed(8) || 'N/A'},`,
      `AlreadySettled=${currentAvailableBalance > preBuyBalance ? 'YES' : 'NO'}`
    );

    // Critical diagnostic: Verify trade.quantity matches buyOrder.executedQty
    if (trade.buyOrder && trade.buyOrder.executedQty !== trade.quantity) {
      console.warn(
        `[OCO] ${trade.symbol} - MISMATCH DETECTED:`,
        `trade.quantity (${trade.quantity}) !== buyOrder.executedQty (${trade.buyOrder.executedQty}). ` +
        `Using trade.quantity for OCO orders.`
      );
    }

    // CRITICAL: Verify balance has fully settled before creating OCO orders
    // This ensures all purchased coins are available before we start locking them
    // Use actual executed quantity (may differ from trade.quantity due to partial fills)
    const actualQuantity = trade.buyOrder?.executedQty || trade.quantity;

    // CRITICAL FIX: Use PRE-BUY balance for settlement verification
    // The preBuyBalance was captured BEFORE the buy order executed
    // We check if current balance >= preBuyBalance + actualQuantity to detect settlement
    const expectedBalanceAfterSettlement = preBuyBalance + actualQuantity;

    if (process.env.NODE_ENV !== 'production') console.log(
      `[OCO] ${trade.symbol} - Settlement verification: ` +
      `Pre-buy balance=${preBuyBalance.toFixed(8)}, ` +
      `Current balance=${currentAvailableBalance.toFixed(8)}, ` +
      `Bought quantity=${actualQuantity.toFixed(8)}, ` +
      `Expected after settlement=${expectedBalanceAfterSettlement.toFixed(8)}`
    );

    // Check if settlement already completed during the proactive delay (route.ts line 89)
    const initialBalanceIncrease = currentAvailableBalance - preBuyBalance;
    const settlementAlreadyComplete = currentAvailableBalance >= (expectedBalanceAfterSettlement - TRADE_EXECUTION.BALANCE_TOLERANCE);

    let settlementVerified = false;

    if (settlementAlreadyComplete) {
      // Settlement completed during the 2-3 second proactive delay - no polling needed!
      settlementVerified = true;
      if (process.env.NODE_ENV !== 'production') console.log(
        `[OCO] ${trade.symbol} - Settlement already complete (detected during proactive delay): ` +
        `Pre-buy balance=${preBuyBalance.toFixed(8)}, ` +
        `Current balance=${currentAvailableBalance.toFixed(8)}, ` +
        `Increase=${initialBalanceIncrease.toFixed(8)}, ` +
        `Expected increase=${actualQuantity.toFixed(8)}. ` +
        `Skipping polling - proceeding immediately with OCO creation.`
      );
    } else {
      // Settlement not yet complete - poll for balance update
      const maxPolls = testnet ? 20 : 10; // Testnet needs more time (up to 20 seconds)
      const pollInterval = 1000; // 1 second between polls

      if (process.env.NODE_ENV !== 'production') console.log(
        `[OCO] ${trade.symbol} - Settlement NOT yet complete. Starting polling... ` +
        `(Pre-buy=${preBuyBalance.toFixed(8)}, Current=${currentAvailableBalance.toFixed(8)}, ` +
        `Expected=${expectedBalanceAfterSettlement.toFixed(8)})`
      );

      const pollStartTime = Date.now();
      for (let poll = 1; poll <= maxPolls; poll++) {
        const currentAccount = await client.getAccount();
        const currentBalance = parseFloat(
          currentAccount.balances.find(b => b.asset === baseAsset)?.free || '0'
        );

        // Check if balance increased by the purchased amount (indicating settlement complete)
        const balanceIncrease = currentBalance - preBuyBalance;
        const settlementComplete = currentBalance >= (expectedBalanceAfterSettlement - TRADE_EXECUTION.BALANCE_TOLERANCE);

        if (process.env.NODE_ENV !== 'production') console.log(
          `[OCO] ${trade.symbol} - Settlement poll ${poll}/${maxPolls}:`,
          `Current=${currentBalance.toFixed(8)},`,
          `Expected=${expectedBalanceAfterSettlement.toFixed(8)},`,
          `Increase=${balanceIncrease.toFixed(8)},`,
          `Complete=${settlementComplete ? 'YES' : 'NO'}`
        );

        if (settlementComplete) {
          settlementVerified = true;
          const elapsedTime = Date.now() - pollStartTime;
          const savedTime = (maxPolls - poll) * pollInterval;
          if (process.env.NODE_ENV !== 'production') console.log(
            `[OCO] ${trade.symbol} - Settlement verified after ${poll}/${maxPolls} polls ` +
            `(${elapsedTime}ms elapsed, ${savedTime}ms saved). ` +
            `Balance increased by ${balanceIncrease.toFixed(8)} ${baseAsset}`
          );
          break;
        }

        if (poll < maxPolls) {
          if (process.env.NODE_ENV !== 'production') console.log(`[OCO] ${trade.symbol} - Waiting ${pollInterval}ms before next poll...`);
          await new Promise(resolve => setTimeout(resolve, pollInterval));
        }
      }

      if (!settlementVerified) {
        // Final check: Re-fetch balance and verify one last time
        const finalAccount = await client.getAccount();
        const finalBalance = parseFloat(
          finalAccount.balances.find(b => b.asset === baseAsset)?.free || '0'
        );

        const finalIncrease = finalBalance - preBuyBalance;
        const finalSettled = finalBalance >= (expectedBalanceAfterSettlement - TRADE_EXECUTION.BALANCE_TOLERANCE);

        if (finalSettled) {
          console.warn(
            `[OCO] ${trade.symbol} - Final check passed: settlement detected ` +
            `(${finalBalance.toFixed(8)} >= ${expectedBalanceAfterSettlement.toFixed(8)}). ` +
            `Balance increased by ${finalIncrease.toFixed(8)}. Proceeding...`
          );
          settlementVerified = true;
        } else {
          throw new ValidationError(
            `Balance settlement verification failed after ${maxPolls} polls. ` +
            `Pre-buy balance: ${preBuyBalance.toFixed(8)}, ` +
            `Current balance: ${finalBalance.toFixed(8)}, ` +
            `Expected balance: ${expectedBalanceAfterSettlement.toFixed(8)}, ` +
            `Actual increase: ${finalIncrease.toFixed(8)}, ` +
            `Expected increase: ${actualQuantity.toFixed(8)}, ` +
            `Shortfall: ${(expectedBalanceAfterSettlement - finalBalance).toFixed(8)}. ` +
            `This indicates the buy order hasn't settled yet or balance sync issues.`
          );
        }
      }
    }

    // SAFE PHANTOM ORDER CLEANUP
    // Cancels both OCO orders and individual orders that aren't tracked in our database
    if (process.env.NODE_ENV !== 'production') console.log(`[OCO] ${trade.symbol} - Checking for phantom orders...`);

    try {
      // 1. Get ALL orders for this symbol from Binance (not just "open" ones)
      // CRITICAL FIX: getOpenOrders() only returns NEW/PARTIALLY_FILLED status
      // but Binance can have PENDING_CANCEL and other transitional states that STILL lock balance
      // Using getAllOrders() ensures we detect ALL orders that might be locking balance
      const allOrders = await client.getAllOrders(trade.symbol, 500);

      // Filter to SELL orders that can lock balance:
      // - NEW: Active order locking balance
      // - PARTIALLY_FILLED: Partially executed, remaining qty locked
      // - PENDING_CANCEL: Being canceled but still locking balance temporarily
      const BALANCE_LOCKING_STATUSES = ['NEW', 'PARTIALLY_FILLED', 'PENDING_CANCEL'];
      const balanceLockingOrders = allOrders.filter(order =>
        order.side === "SELL" &&
        BALANCE_LOCKING_STATUSES.includes(order.status)
      );

      // Log order status breakdown for diagnostics
      const statusCounts = allOrders
        .filter(o => o.side === "SELL")
        .reduce((acc, order) => {
          acc[order.status] = (acc[order.status] || 0) + 1;
          return acc;
        }, {} as Record<string, number>);

      if (process.env.NODE_ENV !== 'production') console.log(
        `[OCO] ${trade.symbol} - Found ${allOrders.length} total orders (${balanceLockingOrders.length} balance-locking SELL orders). ` +
        `Status breakdown: ${JSON.stringify(statusCounts)}`
      );

      if (balanceLockingOrders.length > 0) {
        // 2. Get all legitimate orders from our database for this user and symbol
        const userTrades = await Trade.find({
          userId: trade.userId,
          symbol: trade.symbol,
          status: { $in: ["open", "partial"] }, // Only active trades
          "sellOrders.0": { $exists: true }, // Has at least one sell order
        }).select("sellOrders").lean();

        // Extract all legitimate orderListIds AND individual orderIds
        const legitimateOrderListIds = new Set<number>();
        const legitimateIndividualOrderIds = new Set<number>();

        userTrades.forEach(t => {
          const sellOrders = t.sellOrders as Array<{
            orderId: number;
            orderListId?: number;
          }> | undefined;

          sellOrders?.forEach(order => {
            // Track OCO orders
            if (order.orderListId && order.orderListId !== -1) {
              legitimateOrderListIds.add(order.orderListId);
            }
            // Track individual orders (orderListId is -1, undefined, or missing)
            if (!order.orderListId || order.orderListId === -1) {
              legitimateIndividualOrderIds.add(order.orderId);
            }
          });
        });

        if (process.env.NODE_ENV !== 'production') console.log(
          `[OCO] ${trade.symbol} - Legitimate orderListIds in database: ` +
          `[${Array.from(legitimateOrderListIds).join(", ")}]`
        );
        if (process.env.NODE_ENV !== 'production') console.log(
          `[OCO] ${trade.symbol} - Legitimate individual orderIds in database: ` +
          `[${Array.from(legitimateIndividualOrderIds).join(", ")}]`
        );

        // CRITICAL SAFETY CHECK: If database returns empty but Binance has orders,
        // this could indicate database inconsistency. Skip cleanup to avoid deleting
        // legitimate orders. This prevents data loss if database is temporarily out of sync.
        if (legitimateOrderListIds.size === 0 &&
            legitimateIndividualOrderIds.size === 0 &&
            balanceLockingOrders.length > 0) {
          console.warn(
            `[OCO] ${trade.symbol} - SAFETY: Skipping phantom cleanup. ` +
            `Database shows no legitimate orders but Binance has ${balanceLockingOrders.length} balance-locking SELL orders. ` +
            `This indicates potential database inconsistency. Manual cleanup recommended.`
          );
          // Continue with OCO creation despite potential phantom orders
          // This is safer than accidentally canceling legitimate orders
        } else {
          // 3. Identify phantom OCO orders (with 30s age threshold)
          const AGE_THRESHOLD_MS = 30000; // 30 seconds
          const now = Date.now();

          // Track skipped orders for aggregated logging
          const skippedOCOOrders: { orderId: number; orderListId: number; reason: string }[] = [];
          const skippedIndividualOrders: { orderId: number; reason: string }[] = [];

          const phantomOCOOrders = balanceLockingOrders.filter(order => {
            // Only check orders that are part of an OCO
            if (!order.orderListId || order.orderListId === -1) {
              return false;
            }

            // Safety: Skip orders with missing time field (data integrity issue)
            if (!order.time) {
              console.warn(
                `[OCO] ${trade.symbol} - SAFETY: Skipping order ${order.orderId} ` +
                `(orderListId: ${order.orderListId}) - missing 'time' field. ` +
                `This may indicate API issues or incomplete data.`
              );
              skippedOCOOrders.push({ orderId: order.orderId, orderListId: order.orderListId, reason: 'missing_time' });
              return false;
            }

            // Safety: Skip recent orders (prevents race condition)
            const orderAge = now - order.time;

            // Detect clock skew (future timestamps)
            if (orderAge < 0) {
              console.warn(
                `[OCO] ${trade.symbol} - Clock skew detected! Order ${order.orderId} ` +
                `(orderListId: ${order.orderListId}) has future timestamp. ` +
                `Age: ${(orderAge/1000).toFixed(1)}s. Skipping for safety.`
              );
              skippedOCOOrders.push({ orderId: order.orderId, orderListId: order.orderListId, reason: 'clock_skew' });
              return false;
            }

            if (orderAge < AGE_THRESHOLD_MS) {
              skippedOCOOrders.push({
                orderId: order.orderId,
                orderListId: order.orderListId,
                reason: `age_${(orderAge/1000).toFixed(1)}s`
              });
              return false;
            }

            // Phantom = orderListId exists but not in our database
            return !legitimateOrderListIds.has(order.orderListId);
          });

          // 4. Identify phantom individual orders (with 30s age threshold)
          const phantomIndividualOrders = balanceLockingOrders.filter(order => {
            // Only check individual orders (not part of OCO)
            if (order.orderListId && order.orderListId !== -1) {
              return false;
            }

            // Safety: Skip orders with missing time field (data integrity issue)
            if (!order.time) {
              console.warn(
                `[OCO] ${trade.symbol} - SAFETY: Skipping individual order ${order.orderId} ` +
                `- missing 'time' field. This may indicate API issues or incomplete data.`
              );
              skippedIndividualOrders.push({ orderId: order.orderId, reason: 'missing_time' });
              return false;
            }

            // Safety: Skip recent orders (prevents race condition)
            const orderAge = now - order.time;

            // Detect clock skew (future timestamps)
            if (orderAge < 0) {
              console.warn(
                `[OCO] ${trade.symbol} - Clock skew detected! Individual order ${order.orderId} ` +
                `has future timestamp. Age: ${(orderAge/1000).toFixed(1)}s. Skipping for safety.`
              );
              skippedIndividualOrders.push({ orderId: order.orderId, reason: 'clock_skew' });
              return false;
            }

            if (orderAge < AGE_THRESHOLD_MS) {
              skippedIndividualOrders.push({
                orderId: order.orderId,
                reason: `age_${(orderAge/1000).toFixed(1)}s`
              });
              return false;
            }

            // Phantom = orderId exists on Binance but not in our database
            return !legitimateIndividualOrderIds.has(order.orderId);
          });

          // Aggregated logging for skipped orders (reduces log verbosity)
          if (skippedOCOOrders.length > 0) {
            const recentCount = skippedOCOOrders.filter(o => o.reason.startsWith('age_')).length;
            if (process.env.NODE_ENV !== 'production') console.log(
              `[OCO] ${trade.symbol} - Skipped ${skippedOCOOrders.length} OCO orders ` +
              `(${recentCount} recent, ${skippedOCOOrders.length - recentCount} other reasons): ` +
              `[${skippedOCOOrders.map(o => o.orderId).join(", ")}]`
            );
          }

          if (skippedIndividualOrders.length > 0) {
            const recentCount = skippedIndividualOrders.filter(o => o.reason.startsWith('age_')).length;
            if (process.env.NODE_ENV !== 'production') console.log(
              `[OCO] ${trade.symbol} - Skipped ${skippedIndividualOrders.length} individual orders ` +
              `(${recentCount} recent, ${skippedIndividualOrders.length - recentCount} other reasons): ` +
              `[${skippedIndividualOrders.map(o => o.orderId).join(", ")}]`
            );
          }

          if (process.env.NODE_ENV !== 'production') console.log(
            `[OCO] ${trade.symbol} - Found ${phantomOCOOrders.length} phantom OCO orders ` +
            `(orderListIds: [${phantomOCOOrders.map(o => o.orderListId).filter((v, i, a) => a.indexOf(v) === i).join(", ")}])`
          );
          if (process.env.NODE_ENV !== 'production') console.log(
            `[OCO] ${trade.symbol} - Found ${phantomIndividualOrders.length} phantom individual orders ` +
            `(orderIds: [${phantomIndividualOrders.map(o => o.orderId).join(", ")}])`
          );

          // Enhanced diagnostics: Log detailed phantom order information
          if (phantomOCOOrders.length > 0 || phantomIndividualOrders.length > 0) {
            console.warn(
              `[OCO] ${trade.symbol} - PHANTOM ORDER DETAILS:\n` +
              `${phantomOCOOrders.map(o =>
                `  OCO #${o.orderListId} Order ${o.orderId}: ` +
                `Status=${o.status}, Qty=${o.origQty}, Price=${o.price}, ` +
                `Type=${o.type}, Age=${((Date.now() - (o.time || 0)) / 1000).toFixed(1)}s`
              ).join('\n')}${phantomOCOOrders.length > 0 && phantomIndividualOrders.length > 0 ? '\n' : ''}` +
              `${phantomIndividualOrders.map(o =>
                `  Individual Order ${o.orderId}: ` +
                `Status=${o.status}, Qty=${o.origQty}, Price=${o.price}, ` +
                `Type=${o.type}, Age=${((Date.now() - (o.time || 0)) / 1000).toFixed(1)}s`
              ).join('\n')}`
            );

            // Calculate total locked by phantom orders
            const totalPhantomLocked = [...phantomOCOOrders, ...phantomIndividualOrders]
              .reduce((sum, order) => {
                // For SELL orders, locked amount is the origQty - executedQty
                const remaining = parseFloat(order.origQty) - parseFloat(order.executedQty);
                return sum + remaining;
              }, 0);

            console.warn(
              `[OCO] ${trade.symbol} - Total balance locked by phantom orders: ` +
              `${totalPhantomLocked.toFixed(8)} ${baseAsset} ` +
              `(${(totalPhantomLocked / currentAvailableBalance * 100).toFixed(2)}% of available balance)`
            );
          }

          // 5. Cancel phantom OCO orders by orderListId (cancels entire OCO group)
          const canceledOrderListIds = new Set<number>();
          for (const order of phantomOCOOrders) {
            // Skip if we already canceled this orderListId
            if (canceledOrderListIds.has(order.orderListId!)) {
              continue;
            }

            try {
              if (process.env.NODE_ENV !== 'production') console.log(
                `[OCO] ${trade.symbol} - Canceling phantom OCO orderListId ${order.orderListId} ` +
                `(orderId: ${order.orderId})`
              );
              await client.cancelOCOOrder(trade.symbol, order.orderListId!);
              canceledOrderListIds.add(order.orderListId!);
              if (process.env.NODE_ENV !== 'production') console.log(
                `[OCO] ${trade.symbol} - Successfully canceled phantom OCO orderListId ${order.orderListId}`
              );

              // Rate limiting: wait 100ms between OCO cancellations
              await new Promise(resolve => setTimeout(resolve, 100));
            } catch (cancelError: unknown) {
              // Log but don't fail - phantom order cleanup is best-effort
              console.warn(
                `[OCO] ${trade.symbol} - Failed to cancel phantom OCO orderListId ${order.orderListId}:`,
                cancelError instanceof Error ? cancelError.message : String(cancelError)
              );
            }
          }

          // 6. Cancel phantom individual orders by orderId
          const canceledIndividualOrderIds: number[] = [];
          for (const order of phantomIndividualOrders) {
            try {
              if (process.env.NODE_ENV !== 'production') console.log(
                `[OCO] ${trade.symbol} - Canceling phantom individual orderId ${order.orderId}`
              );
              await client.cancelOrder(trade.symbol, order.orderId);
              canceledIndividualOrderIds.push(order.orderId);
              if (process.env.NODE_ENV !== 'production') console.log(
                `[OCO] ${trade.symbol} - Successfully canceled phantom individual orderId ${order.orderId}`
              );

              // Rate limiting: wait 100ms between individual order cancellations
              await new Promise(resolve => setTimeout(resolve, 100));
            } catch (cancelError: unknown) {
              // Log but don't fail - phantom order cleanup is best-effort
              console.warn(
                `[OCO] ${trade.symbol} - Failed to cancel phantom individual orderId ${order.orderId}:`,
                cancelError instanceof Error ? cancelError.message : String(cancelError)
              );
            }
          }

          // 7. Summary logging
          if (canceledOrderListIds.size > 0 || canceledIndividualOrderIds.length > 0) {
            if (process.env.NODE_ENV !== 'production') console.log(
              `[OCO] ${trade.symbol} - Phantom order cleanup complete. ` +
              `Canceled ${canceledOrderListIds.size} OCO group(s): ` +
              `[${Array.from(canceledOrderListIds).join(", ")}], ` +
              `${canceledIndividualOrderIds.length} individual order(s): ` +
              `[${canceledIndividualOrderIds.join(", ")}]`
            );
          } else {
            if (process.env.NODE_ENV !== 'production') console.log(`[OCO] ${trade.symbol} - No phantom orders to clean up`);
          }
        }
      }
    } catch (cleanupError: unknown) {
      // Log but don't fail - phantom order cleanup is best-effort
      console.warn(
        `[OCO] ${trade.symbol} - Phantom order cleanup failed:`,
        cleanupError instanceof Error ? cleanupError.message : String(cleanupError)
      );
    }

    // Diagnostic: Log if locked balance is unexpectedly high
    if (initialLockedBalance > 0) {
      console.warn(
        `[OCO] ${trade.symbol} - WARNING: Locked balance detected ` +
        `(${initialLockedBalance.toFixed(8)} ${baseAsset}) before OCO creation. ` +
        `This may indicate phantom orders from previous failed attempts that were not cleaned up.`
      );
    }

    // Log distribution strategy being used
    if (process.env.NODE_ENV !== 'production') console.log(
      `[OCO] ${trade.symbol} - Using ${targets.length} target(s) with distribution: ` +
      `${distribution.map(d => d.toFixed(2)).join("%, ")}%`
    );

    let totalAllocatedQty = 0;
    // CRITICAL: Use actualQuantity (executed qty) not trade.quantity to prevent over-allocation on partial fills
    const ALLOCATION_CAP = actualQuantity; // Maximum we can allocate (100%)

    // Track failed targets for UI display and cleanup OCO
    const failedTargets: Array<{
      index: number;
      price: number;
      reason: string;
      code?: string;
      timestamp: Date;
    }> = [];

    // CRITICAL FIX: Client-side balance tracking to avoid Binance settlement lag
    // Binance's /api/v3/account endpoint has 100-500ms delay in updating "locked" balance
    // after OCO creation, causing "Insufficient balance" errors on subsequent OCOs
    const trackedAvailableBalance = currentAvailableBalance; // Start with current balance (immutable)
    let trackedLockedBalance = 0; // Track cumulative locked balance from our OCOs (mutable)

    if (process.env.NODE_ENV !== 'production') console.log(
      `[OCO] ${trade.symbol} - Starting OCO creation with client-side balance tracking:`,
      `Initial available=${trackedAvailableBalance.toFixed(8)} ${baseAsset},`,
      `Target count=${targets.length},`,
      `Distribution=${distribution.map(d => d.toFixed(1)).join('%, ')}%`
    );

    for (let i = 0; i < targets.length; i++) {
      // Use client-side tracked balance instead of fetching from Binance each iteration
      // This prevents race condition where Binance hasn't updated locked balance yet
      if (process.env.NODE_ENV !== 'production') console.log(
        `[OCO] ${trade.symbol} - Balance before OCO ${i}:`,
        `Tracked available=${trackedAvailableBalance.toFixed(8)},`,
        `Tracked locked=${trackedLockedBalance.toFixed(8)},`,
        `Previous OCOs locked=${trackedLockedBalance.toFixed(8)}`
      );

      const targetPrice = targets[i];
      const percentage = distribution[i]; // Safe - always within bounds (no fallback needed)
      // CRITICAL: Calculate OCO quantity based on ACTUAL executed quantity, not planned quantity
      const qtyForTarget = (actualQuantity * percentage) / 100;

      // Validate and adjust target price and quantity
      const validation = validateAllFilters(targetPrice, qtyForTarget, filters);
      if (!validation.isValid) {
        console.warn(`[OCO] ${trade.symbol} - Skipping target ${i} due to filter validation: ${validation.errors.join(", ")}`);
        continue;
      }

      let adjustedQty = validation.adjustedQuantity || qtyForTarget;
      const adjustedPrice = validation.adjustedPrice || targetPrice;

      // **CRITICAL FIX**: Cap adjusted quantity to remaining allocation to prevent over-allocation
      const remainingAllocation = ALLOCATION_CAP - totalAllocatedQty;
      if (adjustedQty > remainingAllocation + TRADE_EXECUTION.BALANCE_TOLERANCE) {
        console.warn(
          `[OCO] ${trade.symbol} - Adjusted quantity ${adjustedQty.toFixed(8)} ` +
          `exceeds remaining allocation ${remainingAllocation.toFixed(8)} ` +
          `(${(remainingAllocation / ALLOCATION_CAP * 100).toFixed(2)}% of buy order). ` +
          `Capping to prevent over-allocation.`
        );
        adjustedQty = remainingAllocation;

        // Re-validate capped quantity against filters
        const revalidation = validateAllFilters(targetPrice, adjustedQty, filters);
        if (!revalidation.isValid) {
          console.warn(
            `[OCO] ${trade.symbol} - Skipping target ${i} after capping: ${revalidation.errors.join(", ")}`
          );
          continue;
        }
        adjustedQty = revalidation.adjustedQuantity || adjustedQty;
      }

      // Check if we have enough free balance remaining for this OCO
      // Use client-side tracked balance (prevents race condition with Binance API lag)
      const availableForThisOCO = trackedAvailableBalance - trackedLockedBalance;

      if (process.env.NODE_ENV !== 'production') console.log(
        `[OCO] ${trade.symbol} - Balance check for target ${i}:`,
        `Total free=${trackedAvailableBalance.toFixed(8)},`,
        `Already locked=${trackedLockedBalance.toFixed(8)},`,
        `Remaining available=${availableForThisOCO.toFixed(8)},`,
        `Required for this OCO=${adjustedQty.toFixed(8)},`,
        `Sufficient=${adjustedQty <= availableForThisOCO + TRADE_EXECUTION.BALANCE_TOLERANCE ? 'YES' : 'NO'}`
      );

      if (adjustedQty > availableForThisOCO + TRADE_EXECUTION.BALANCE_TOLERANCE) {
        const originalQty = adjustedQty;

        // Check if we have ANY balance left
        if (availableForThisOCO < TRADE_EXECUTION.BALANCE_TOLERANCE) {
          console.warn(
            `[OCO] ${trade.symbol} - INSUFFICIENT BALANCE: No balance remaining for target ${i + 1}/${targets.length}. ` +
            `Binance API reports free balance: ${trackedAvailableBalance.toFixed(8)} ${baseAsset}, ` +
            `Already locked by previous OCOs: ${trackedLockedBalance.toFixed(8)} ${baseAsset}, ` +
            `Remaining available: ${availableForThisOCO.toFixed(8)} ${baseAsset} (below ${TRADE_EXECUTION.BALANCE_TOLERANCE} tolerance). ` +
            `Skipping this and remaining targets.`
          );
          continue; // Skip this and remaining targets
        }

        // Adjust to use all remaining balance
        adjustedQty = availableForThisOCO;

        console.warn(
          `[OCO] ${trade.symbol} - BALANCE ADJUSTMENT: Insufficient balance for target ${i + 1}. ` +
          `Originally requested: ${originalQty.toFixed(8)} ${baseAsset}, ` +
          `Available (free - locked): ${availableForThisOCO.toFixed(8)} ${baseAsset}, ` +
          `Breakdown: Total free=${trackedAvailableBalance.toFixed(8)}, Already locked=${trackedLockedBalance.toFixed(8)}. ` +
          `Adjusting quantity to use ALL remaining balance.`
        );

        // Re-validate adjusted quantity against filters
        const revalidation = validateAllFilters(adjustedPrice, adjustedQty, filters);
        if (!revalidation.isValid) {
          console.warn(
            `[OCO] ${trade.symbol} - Skipping target ${i} after balance adjustment: ${revalidation.errors.join(", ")}`
          );
          continue;
        }
        adjustedQty = revalidation.adjustedQuantity || adjustedQty;
      }

      // Validate and adjust stop loss price (use adjustedStopLoss from emergency logic)
      const stopPriceValidation = validateAllFilters(adjustedStopLoss, adjustedQty, filters);
      const adjustedStopPrice = stopPriceValidation.adjustedPrice || adjustedStopLoss;

      // Calculate and validate stop limit price (0.5% below stop loss for sell orders)
      const rawStopLimitPrice = adjustedStopPrice * 0.995;
      const stopLimitValidation = validateAllFilters(rawStopLimitPrice, adjustedQty, filters);
      const adjustedStopLimitPrice = stopLimitValidation.adjustedPrice || rawStopLimitPrice;

      // CRITICAL: Fetch fresh market price for PERCENT_PRICE_BY_SIDE validation
      // This prevents stale price issues that can cause -1013 filter failures
      const freshTicker = await client.get24hrTicker(trade.symbol);
      const currentMarketPrice = parseFloat(freshTicker.lastPrice);

      // Validate OCO prices against PERCENT_PRICE_BY_SIDE filter BEFORE API call
      // This prevents wasting API calls and provides better error messages to users
      const ocoFilterValidation = validateOCOFilters(
        adjustedPrice,          // Take profit price
        adjustedStopPrice,      // Stop loss stop price
        adjustedStopLimitPrice, // Stop loss limit price
        adjustedQty,            // Order quantity
        currentMarketPrice,     // Fresh market price
        filters
      );

      if (!ocoFilterValidation.isValid) {
        const errorMsg = `OCO filter validation failed for target ${i + 1}: ${ocoFilterValidation.errors.join("; ")}`;
        console.error(`[OCO] ${trade.symbol} - ${errorMsg}`);

        // Update signal with detailed error
        await Signal.findByIdAndUpdate(trade.signalId, {
          status: "failed",
          executionError: errorMsg,
          executionErrorCode: "-1013",
          executionErrorTimestamp: new Date(),
          failureReason: "FILTER_VIOLATION",
        });

        // Update trade with error details
        await Trade.findByIdAndUpdate(trade._id, {
          status: "cancelled",
          closeReason: "cancelled",
          closeReasonDetail: errorMsg,
          lastError: {
            message: errorMsg,
            code: "-1013",
            timestamp: new Date(),
          },
        });

        throw new ValidationError(
          `${errorMsg}. Current market price: ${currentMarketPrice.toFixed(8)}. ` +
          `Please check your signal and ensure target/stop loss prices are within allowed ranges.`
        );
      }

      // CRITICAL: Calculate current tracked balance state for diagnostic logging
      const currentTrackedFree = trackedAvailableBalance - trackedLockedBalance;

      // eslint-disable-next-line no-console
      if (process.env.NODE_ENV !== 'production') console.log(`[OCO] ${trade.symbol} - Creating OCO for target ${i + 1}/${targets.length}:`, {
        symbol: trade.symbol,
        currentMarketPrice: currentMarketPrice,
        targetPrice: targetPrice,
        adjustedPrice: adjustedPrice,
        quantity: qtyForTarget.toFixed(8),
        adjustedQty: adjustedQty.toFixed(8),
        trackedAvailableBalance: trackedAvailableBalance.toFixed(8), // Total free balance from Binance API
        trackedLockedBalance: trackedLockedBalance.toFixed(8),       // Cumulative locked by our previous OCOs
        currentTrackedFree: currentTrackedFree.toFixed(8),          // Remaining available: free - locked
        initialFreeBalance: currentAvailableBalance.toFixed(8),     // Initial free balance (reference only)
        percentage: `${percentage}%`,
        originalStopLoss: trade.stopLoss,
        adjustedStopLoss: adjustedStopLoss,
        adjustedStopPrice: adjustedStopPrice,
        rawStopLimitPrice: rawStopLimitPrice,
        adjustedStopLimitPrice: adjustedStopLimitPrice,
        percentPriceValidation: "PASSED",
      });

      try {
        // Balance check function to verify settlement during retries
        const balanceCheckFn = async () => {
          const accountInfo = await client.getAccount();
          const assetBalance = accountInfo.balances.find(b => b.asset === baseAsset);
          const available = parseFloat(assetBalance?.free || '0');
          return {
            available,
            required: adjustedQty,
          };
        };

        // Use retry logic for OCO creation (handles testnet settlement delays)
        const ocoResponse = await retryOCOCreation(
          () => client.createOCOOrder(
            trade.symbol,
            adjustedQty,
            adjustedPrice,
            adjustedStopPrice,
            adjustedStopLimitPrice
          ),
          trade.symbol, // Pass symbol for logging
          balanceCheckFn // Pass balance check function for retry diagnostics
        );

        // OCO response has orderReports array with 2 orders (LIMIT_MAKER and STOP_LOSS_LIMIT)
        // Validate response structure
        if (!ocoResponse.orderReports || !Array.isArray(ocoResponse.orderReports)) {
          throw new ValidationError(
            `Invalid OCO response structure: orderReports is ${typeof ocoResponse.orderReports}`
          );
        }

        if (ocoResponse.orderReports.length !== 2) {
          console.error(`[OCO] ${trade.symbol} - Unexpected orderReports length:`, {
            orderListId: ocoResponse.orderListId,
            orderCount: ocoResponse.orderReports.length,
            orders: ocoResponse.orderReports,
          });
          throw new ValidationError(
            `OCO response should have 2 orders, got ${ocoResponse.orderReports.length}`
          );
        }

        // Extract both orders from the OCO pair
        const limitMakerOrder = ocoResponse.orderReports.find(o => o.type === 'LIMIT_MAKER');
        const stopLossOrder = ocoResponse.orderReports.find(o => o.type === 'STOP_LOSS_LIMIT');

        if (!limitMakerOrder) {
          const actualTypes = ocoResponse.orderReports.map(o => o.type).join(', ');
          throw new ValidationError(
            `OCO LIMIT_MAKER order not found. Order types: ${actualTypes}. OrderListId: ${ocoResponse.orderListId}`
          );
        }

        if (!stopLossOrder) {
          const actualTypes = ocoResponse.orderReports.map(o => o.type).join(', ');
          throw new ValidationError(
            `OCO STOP_LOSS_LIMIT order not found. Order types: ${actualTypes}. OrderListId: ${ocoResponse.orderListId}`
          );
        }

        // Push both order IDs for tracking
        if (limitMakerOrder) {
          orders.push({
            orderId: limitMakerOrder.orderId,
            status: limitMakerOrder.status,
            transactTime: limitMakerOrder.transactTime,
          });
        }
        if (stopLossOrder) {
          orders.push({
            orderId: stopLossOrder.orderId,
            status: stopLossOrder.status,
            transactTime: stopLossOrder.transactTime,
          });
        }

        totalAllocatedQty += adjustedQty;

        // CRITICAL: Update client-side balance tracking immediately after OCO creation
        // This prevents race condition - Binance API may take 100-500ms to reflect locked balance
        trackedLockedBalance += adjustedQty;
        const remainingBalance = trackedAvailableBalance - trackedLockedBalance;

        // Log successful OCO creation with balance tracking
        if (process.env.NODE_ENV !== 'production') console.log(
          `[OCO] ${trade.symbol} - OCO ${i} created successfully. ` +
          `Locked ${adjustedQty.toFixed(8)} ${baseAsset} (${percentage}% of position). ` +
          `Total allocated: ${totalAllocatedQty.toFixed(8)} / ${ALLOCATION_CAP.toFixed(8)} ${baseAsset} ` +
          `(${(totalAllocatedQty / ALLOCATION_CAP * 100).toFixed(2)}%). ` +
          `Remaining available: ${remainingBalance.toFixed(8)} ${baseAsset}`
        );

        // Store both OCO orders (take profit LIMIT_MAKER and stop loss STOP_LOSS_LIMIT)
        // CRITICAL: Store actual Binance order types for proper UI display
        if (limitMakerOrder) {
          trade.sellOrders.push({
            orderId: limitMakerOrder.orderId,
            orderListId: ocoResponse.orderListId,
            symbol: trade.symbol,
            side: "SELL" as const,
            type: "LIMIT_MAKER" as const, // Store actual Binance type (not "OCO")
            quantity: parseFloat(limitMakerOrder.origQty),
            price: parseFloat(limitMakerOrder.price),
            stopPrice: adjustedStopLoss, // Use adjusted stop loss
            executedQty: parseFloat(limitMakerOrder.executedQty),
            cummulativeQuoteQty: parseFloat(limitMakerOrder.cummulativeQuoteQty),
            status: limitMakerOrder.status,
            timestamp: new Date(limitMakerOrder.transactTime),
          });
        }

        if (stopLossOrder) {
          trade.sellOrders.push({
            orderId: stopLossOrder.orderId,
            orderListId: ocoResponse.orderListId,
            symbol: trade.symbol,
            side: "SELL" as const,
            type: "STOP_LOSS_LIMIT" as const, // Store actual Binance type (not "OCO")
            quantity: parseFloat(stopLossOrder.origQty),
            price: parseFloat(stopLossOrder.price),
            stopPrice: parseFloat(stopLossOrder.stopPrice || String(adjustedStopLoss)), // Use adjusted stop loss
            executedQty: parseFloat(stopLossOrder.executedQty),
            cummulativeQuoteQty: parseFloat(stopLossOrder.cummulativeQuoteQty),
            status: stopLossOrder.status,
            timestamp: new Date(stopLossOrder.transactTime),
          });
        }
      } catch (error) {
        // Track failed target with details
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        const errorCode = error instanceof BinanceAPIError ? String(error.code) : undefined;

        console.error(`[OCO] ${trade.symbol} - Failed to create OCO for target ${i + 1}:`, {
          targetPrice: targets[i],
          error: errorMessage,
          code: errorCode,
        });

        // Add to failed targets array (initialized below)
        failedTargets.push({
          index: i,
          price: targets[i],
          reason: errorMessage,
          code: errorCode,
          timestamp: new Date(),
        });
      }
    }

    // Verify balance tracking against Binance (optional, for safety)
    // This helps detect drift between client-side tracking and actual Binance state
    try {
      const finalAccount = await client.getAccount();
      const finalAssetBalance = finalAccount.balances.find(b => b.asset === baseAsset);
      const finalLockedBalance = parseFloat(finalAssetBalance?.locked || '0');
      const actuallyLocked = finalLockedBalance - initialLockedBalance;

      if (process.env.NODE_ENV !== 'production') console.log(
        `[OCO] ${trade.symbol} - Balance verification after OCO creation:`,
        `Client-side tracked locked: ${trackedLockedBalance.toFixed(8)} ${baseAsset},`,
        `Binance reported locked: ${actuallyLocked.toFixed(8)} ${baseAsset},`,
        `Difference: ${Math.abs(trackedLockedBalance - actuallyLocked).toFixed(8)} ${baseAsset}`
      );

      // Warn if significant drift (>1% difference)
      const drift = Math.abs(trackedLockedBalance - actuallyLocked);
      if (drift > actualQuantity * 0.01) {
        console.warn(
          `[OCO] ${trade.symbol} - Balance tracking drift detected! ` +
          `Client tracked ${trackedLockedBalance.toFixed(8)}, ` +
          `Binance shows ${actuallyLocked.toFixed(8)}. ` +
          `Difference: ${drift.toFixed(8)} ${baseAsset} ` +
          `(${(drift / actualQuantity * 100).toFixed(2)}%)`
        );
      }
    } catch (verifyError) {
      // Don't fail the entire process for verification error
      console.warn(
        `[OCO] ${trade.symbol} - Balance verification failed (non-critical):`,
        verifyError instanceof Error ? verifyError.message : String(verifyError)
      );
    }

    // Calculate allocation statistics (with division by zero protection)
    const unallocatedQty = actualQuantity - totalAllocatedQty;
    const allocationPercentage = actualQuantity > 0
      ? (totalAllocatedQty / actualQuantity) * 100
      : 0;
    const createdOCOCount = orders.length / 2; // Each OCO has 2 orders

    // Store OCO creation summary
    trade.ocoCreationSummary = {
      createdCount: createdOCOCount,
      failedCount: failedTargets.length,
      totalTargets: targets.length,
      allocatedQuantity: totalAllocatedQty,
      unallocatedQuantity: Math.max(0, unallocatedQty),
      allocationPercentage: parseFloat(allocationPercentage.toFixed(2)),
    };

    // Store failed targets for UI display
    if (failedTargets.length > 0) {
      trade.failedTargets = failedTargets;
    }

    // FINAL SUMMARY: Log balance allocation summary
    if (process.env.NODE_ENV !== 'production') console.log(
      `[OCO] ${trade.symbol} - FINAL ALLOCATION SUMMARY:`,
      `Bought quantity: ${actualQuantity.toFixed(8)} ${baseAsset},`,
      `Total allocated: ${totalAllocatedQty.toFixed(8)} ${baseAsset} (${allocationPercentage.toFixed(2)}%),`,
      `Unallocated: ${Math.max(0, unallocatedQty).toFixed(8)} ${baseAsset},`,
      `Successful OCOs: ${createdOCOCount}/${targets.length},`,
      `Failed targets: ${failedTargets.length},`,
      `Initial free balance: ${trackedAvailableBalance.toFixed(8)} ${baseAsset},`,
      `Total locked: ${trackedLockedBalance.toFixed(8)} ${baseAsset},`,
      `Remaining free: ${(trackedAvailableBalance - trackedLockedBalance).toFixed(8)} ${baseAsset}`
    );

    // Log allocation mismatch if significant
    if (unallocatedQty > TRADE_EXECUTION.BALANCE_TOLERANCE) {
      console.warn(
        `[OCO] ${trade.symbol} - Allocation mismatch:`,
        {
          buyQuantity: actualQuantity.toFixed(8),
          allocatedQuantity: totalAllocatedQty.toFixed(8),
          unallocatedQuantity: unallocatedQty.toFixed(8),
          allocationPercentage: allocationPercentage.toFixed(2) + '%',
          successfulOCOs: createdOCOCount,
          failedTargets: failedTargets.length,
          totalTargets: targets.length,
        }
      );

      // CLEANUP OCO: Try to create one more OCO with remaining balance
      // This prevents coins from being stranded when a target fails
      if (createdOCOCount > 0 && unallocatedQty > 0) {
        try {
          if (process.env.NODE_ENV !== 'production') console.log(
            `[OCO] ${trade.symbol} - Attempting cleanup OCO for ${unallocatedQty.toFixed(8)} unallocated coins...`
          );

          // Get fresh balance to verify we have the unallocated coins
          const cleanupAccountInfo = await client.getAccount();
          const cleanupAssetBalance = cleanupAccountInfo.balances.find(b => b.asset === baseAsset);
          const cleanupAvailableBalance = parseFloat(cleanupAssetBalance?.free || '0');

          // Only attempt cleanup if we have enough balance
          const cleanupQty = Math.min(unallocatedQty, cleanupAvailableBalance);

          if (cleanupQty > TRADE_EXECUTION.BALANCE_TOLERANCE) {
            // Validate cleanup quantity against filters
            const lastSuccessfulTargetIndex = targets.length - 1 - failedTargets.length;
            const cleanupTargetPrice = targets[Math.max(0, lastSuccessfulTargetIndex)] || targets[0];

            const cleanupValidation = validateAllFilters(cleanupTargetPrice, cleanupQty, filters);

            if (cleanupValidation.isValid) {
              const cleanupAdjustedQty = cleanupValidation.adjustedQuantity || cleanupQty;
              const cleanupAdjustedPrice = cleanupValidation.adjustedPrice || cleanupTargetPrice;

              // Validate stop loss for cleanup OCO
              const cleanupStopValidation = validateAllFilters(adjustedStopLoss, cleanupAdjustedQty, filters);
              const cleanupStopPrice = cleanupStopValidation.adjustedPrice || adjustedStopLoss;
              const cleanupStopLimitPrice = cleanupStopPrice * 0.995;

              // Create cleanup OCO
              const cleanupOCO = await client.createOCOOrder(
                trade.symbol,
                cleanupAdjustedQty,
                cleanupAdjustedPrice,
                cleanupStopPrice,
                cleanupStopLimitPrice
              );

              if (cleanupOCO.orderReports && cleanupOCO.orderReports.length === 2) {
                const cleanupLimitMaker = cleanupOCO.orderReports.find(o => o.type === 'LIMIT_MAKER');
                const cleanupStopLoss = cleanupOCO.orderReports.find(o => o.type === 'STOP_LOSS_LIMIT');

                if (cleanupLimitMaker) {
                  orders.push({
                    orderId: cleanupLimitMaker.orderId,
                    status: cleanupLimitMaker.status,
                    transactTime: cleanupLimitMaker.transactTime,
                  });
                  trade.sellOrders.push({
                    orderId: cleanupLimitMaker.orderId,
                    orderListId: cleanupOCO.orderListId,
                    symbol: trade.symbol,
                    side: "SELL" as const,
                    type: "LIMIT_MAKER" as const,
                    quantity: parseFloat(cleanupLimitMaker.origQty),
                    price: parseFloat(cleanupLimitMaker.price),
                    stopPrice: cleanupStopPrice,
                    executedQty: parseFloat(cleanupLimitMaker.executedQty),
                    cummulativeQuoteQty: parseFloat(cleanupLimitMaker.cummulativeQuoteQty),
                    status: cleanupLimitMaker.status,
                    timestamp: new Date(cleanupLimitMaker.transactTime),
                  });
                }

                if (cleanupStopLoss) {
                  orders.push({
                    orderId: cleanupStopLoss.orderId,
                    status: cleanupStopLoss.status,
                    transactTime: cleanupStopLoss.transactTime,
                  });
                  trade.sellOrders.push({
                    orderId: cleanupStopLoss.orderId,
                    orderListId: cleanupOCO.orderListId,
                    symbol: trade.symbol,
                    side: "SELL" as const,
                    type: "STOP_LOSS_LIMIT" as const,
                    quantity: parseFloat(cleanupStopLoss.origQty),
                    price: parseFloat(cleanupStopLoss.price),
                    stopPrice: parseFloat(cleanupStopLoss.stopPrice || String(cleanupStopPrice)),
                    executedQty: parseFloat(cleanupStopLoss.executedQty),
                    cummulativeQuoteQty: parseFloat(cleanupStopLoss.cummulativeQuoteQty),
                    status: cleanupStopLoss.status,
                    timestamp: new Date(cleanupStopLoss.transactTime),
                  });
                }

                totalAllocatedQty += cleanupAdjustedQty;

                // Update summary with cleanup success
                trade.ocoCreationSummary = {
                  ...trade.ocoCreationSummary,
                  createdCount: (orders.length / 2),
                  allocatedQuantity: totalAllocatedQty,
                  unallocatedQuantity: Math.max(0, actualQuantity - totalAllocatedQty),
                  allocationPercentage: parseFloat(((totalAllocatedQty / actualQuantity) * 100).toFixed(2)),
                };

                if (process.env.NODE_ENV !== 'production') console.log(
                  `[OCO] ${trade.symbol} - Cleanup OCO created successfully. ` +
                  `Allocated additional ${cleanupAdjustedQty.toFixed(8)} ${baseAsset}. ` +
                  `New total: ${totalAllocatedQty.toFixed(8)} / ${actualQuantity.toFixed(8)} ` +
                  `(${((totalAllocatedQty / actualQuantity) * 100).toFixed(2)}%)`
                );
              }
            } else {
              if (process.env.NODE_ENV !== 'production') console.log(
                `[OCO] ${trade.symbol} - Cleanup OCO skipped: filter validation failed. ` +
                `Errors: ${cleanupValidation.errors.join(", ")}`
              );
            }
          } else {
            if (process.env.NODE_ENV !== 'production') console.log(
              `[OCO] ${trade.symbol} - Cleanup OCO skipped: insufficient balance. ` +
              `Unallocated: ${unallocatedQty.toFixed(8)}, Available: ${cleanupAvailableBalance.toFixed(8)}`
            );
          }
        } catch (cleanupError) {
          console.warn(
            `[OCO] ${trade.symbol} - Cleanup OCO failed:`,
            cleanupError instanceof Error ? cleanupError.message : String(cleanupError)
          );
          // Don't fail the whole operation - cleanup is best-effort
        }
      }
    }

    // Ensure at least one OCO order was created
    if (orders.length === 0) {
      // CRITICAL: Save failure summary BEFORE throwing so UI can show failure details
      trade.ocoCreationSummary = {
        createdCount: 0,
        failedCount: failedTargets.length,
        totalTargets: targets.length,
        allocatedQuantity: 0,
        unallocatedQuantity: actualQuantity,
        allocationPercentage: 0,
      };
      trade.failedTargets = failedTargets;
      await trade.save();

      throw new ValidationError(
        `Failed to create any OCO orders for ${trade.symbol}. ` +
        `All ${targets.length} target(s) failed. ` +
        `Failed targets: ${failedTargets.map(f => `#${f.index + 1} (${f.reason})`).join(", ")}. ` +
        `Check signal prices against Binance exchange filters.`
      );
    }

    await trade.save();

    // Send notification if targets were adjusted and user hasn't been notified yet
    if (targetAdjustmentReason && !trade.targetAdjustmentNotificationSent) {
      if (process.env.NODE_ENV !== 'production') console.log(`[OCO Creation] Sending target adjustment notification for ${trade.symbol}...`);

      // Send notification asynchronously (don't block OCO success response)
      sendTargetAdjustmentNotification({
        userId: trade.userId,
        tradeId: trade._id,
        symbol: trade.symbol,
        adjustmentReason: targetAdjustmentReason,
        originalTargets: originalTargets,
        adjustedTargets: adjustedTargets,
        originalStopLoss: originalTargets.length === 0 ? trade.stopLoss : undefined,
        adjustedStopLoss: adjustedStopLoss !== trade.stopLoss ? adjustedStopLoss : undefined,
        entryPrice: trade.entryPrice,
        currentPrice: currentPrice,
        timestamp: new Date(),
      }).then(() => {
        // Mark notification as sent
        Trade.findByIdAndUpdate(trade._id, { targetAdjustmentNotificationSent: true }).catch(err => {
          console.error(`[OCO Creation] Failed to update notification flag:`, err);
        });
      }).catch(err => {
        console.error(`[OCO Creation] Failed to send target adjustment notification:`, err);
      });
    }

    return {
      success: true,
      orders,
    };
  } catch (error) {
    console.error(`[OCO Creation] Failed:`, {
      tradeId,
      error: error instanceof Error ? error.message : "Unknown error",
      errorType: error instanceof BinanceAPIError ? "BinanceAPIError" : "Unknown",
    });

    // Store error in both Signal and Trade models
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    const errorCode = formatErrorCode(error);
    const failureReason = categorizeError(error);

    // Load trade to get signalId (trade is out of scope in catch block)
    const failedTrade = await Trade.findById(tradeId);
    if (failedTrade) {
      // Update Signal with OCO failure
      await Signal.findByIdAndUpdate(failedTrade.signalId, {
        status: "failed",
        executionError: `OCO creation failed: ${errorMessage}`,
        executionErrorCode: errorCode,
        executionErrorTimestamp: new Date(),
        failureReason: failureReason,
      });

      // Update Trade with error history
      await Trade.findByIdAndUpdate(failedTrade._id, {
        lastError: {
          message: errorMessage,
          code: errorCode,
          timestamp: new Date(),
        },
        $push: {
          tradeErrors: {
            message: errorMessage,
            code: errorCode,
            timestamp: new Date(),
            operation: 'OCO_CREATION',
          },
        },
      });

      if (process.env.NODE_ENV !== 'production') console.log(`[OCO Creation] Error persisted to database:`, {
        signalId: failedTrade.signalId,
        tradeId: failedTrade._id,
        errorCode,
        failureReason,
      });
    }

    return {
      success: false,
      error: errorMessage,
    };
  }
}
