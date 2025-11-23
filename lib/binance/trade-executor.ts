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

    console.log(`[Trade Executor] Executing buy order for ${signal.symbol}:`, {
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

    console.log(`[Trade Executor] Buy order executed successfully:`, {
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

    console.log(`[Trade Executor] Buy order processed:`, {
      executedQuantity: executedQty,
      executedPrice: executedPrice,
      totalCost: parseFloat(buyOrder.cummulativeQuoteQty || "0"),
    });

    // CRITICAL FIX: Store ORIGINAL targets - filtering will happen in createOCOOrders()
    // This prevents race condition where price changes between buy order and OCO creation
    console.log(`[Trade Executor] Storing ORIGINAL targets for ${signal.symbol}:`, {
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

    console.log(`[Trade Executor] Trade document created:`, {
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

    console.log(`[Trade Executor] Trade execution successful - ready for OCO creation`, {
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

    console.log(`[Trade Executor] Signal ${signalId} marked as failed:`, {
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
      console.log(`[OCO] ${symbol} - Attempt ${attempt}/${maxRetries} (elapsed: ${elapsed}ms)`);

      // Optional balance check on retry attempts (diagnostic)
      // Note: Balance already verified before OCO loop starts, this is for diagnostics during retries
      if (balanceCheckFn && attempt > 1) {
        const balanceCheck = await balanceCheckFn();
        console.log(
          `[OCO] ${symbol} - Balance diagnostic on retry ${attempt - 1}:`,
          `Available=${balanceCheck.available.toFixed(8)},`,
          `Required=${balanceCheck.required.toFixed(8)},`,
          `Shortfall=${Math.max(0, balanceCheck.required - balanceCheck.available).toFixed(8)}`
        );
      }

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

    console.log(`[OCO Creation] Starting OCO order creation:`, {
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

    console.log(`[OCO Creation] Current market state for ${trade.symbol}:`, {
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

    console.log(`[OCO Creation] Target validation for ${trade.symbol}:`, {
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
        console.log(
          `[OCO Creation] ${trade.symbol} - Using fallback 1% emergency target: ${emergencyTarget.toFixed(8)} ` +
          `(adjusted from filters: ${fallbackValidation.adjustedPrice ? 'YES' : 'NO'})`
        );
      } else {
        // Use 1.5% target with adjusted price if needed
        emergencyTarget = emergencyValidation.adjustedPrice || emergencyTarget;
        console.log(
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
        console.log(
          `[OCO Creation] ${trade.symbol} - Emergency stop loss applied: ` +
          `${emergencyStopLoss.toFixed(8)} (2% max loss) vs original ${originalStopLoss.toFixed(8)}. ` +
          `Using TIGHTER stop loss: ${adjustedStopLoss.toFixed(8)}`
        );
      } else {
        adjustedStopLoss = originalStopLoss;
        console.log(
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

    console.log(
      `[OCO] ${trade.symbol} - User's target distribution setting: ${userDistribution.join(", ")}%`,
      `(${userDistribution.length} values for ${targets.length} targets)`
    );

    // CRITICAL: Handle distribution length vs target count mismatch
    if (targets.length === userDistribution.length) {
      // Perfect match - use as-is (validation already ensures sum is 100%)
      distribution = userDistribution;
      console.log(`[OCO] ${trade.symbol} - Distribution length matches target count - using as-is`);
    } else if (targets.length < userDistribution.length) {
      // Fewer targets than distribution values - slice and normalize to 100%
      // Example: 3 targets but distribution is [75, 15, 10] → use [75, 15, 10]
      // Example: 2 targets but distribution is [75, 15, 10] → use [75, 15] → normalize to [83.33, 16.67]
      const baseDist = userDistribution.slice(0, targets.length);
      const sum = baseDist.reduce((a, b) => a + b, 0);

      if (Math.abs(sum - 100) < 0.01) {
        // Already sums to 100% (within tolerance)
        distribution = baseDist;
        console.log(
          `[OCO] ${trade.symbol} - Sliced distribution already sums to 100%: ${baseDist.join(", ")}%`
        );
      } else {
        // Normalize to 100%
        distribution = baseDist.map((pct) => (pct / sum) * 100);
        console.log(
          `[OCO] ${trade.symbol} - Normalized sliced distribution from ${baseDist.join(", ")}% ` +
          `(sum=${sum.toFixed(2)}%) to ${distribution.map((d) => d.toFixed(2)).join(", ")}%`
        );
      }
    } else {
      // More targets than distribution values - distribute equally
      // Example: 5 targets but distribution is [75, 15, 10] → use [20, 20, 20, 20, 20]
      const percentagePerTarget = 100 / targets.length;
      distribution = Array(targets.length).fill(percentagePerTarget);
      console.log(
        `[OCO] ${trade.symbol} - More targets than distribution values ` +
        `(${targets.length} > ${userDistribution.length}). Using equal distribution: ` +
        `${percentagePerTarget.toFixed(2)}% per target`
      );
    }

    console.log(
      `[OCO] ${trade.symbol} - Final distribution for ${targets.length} targets: ` +
      `${distribution.map((d) => d.toFixed(2)).join(", ")}% (sum=${distribution.reduce((a, b) => a + b, 0).toFixed(2)}%)`
    );

    // Use baseAsset from symbol info with fallback to string parsing
    const baseAsset = symbolInfo.baseAsset || trade.symbol.replace(/USDT$/, '');
    if (!baseAsset) {
      throw new ValidationError(`Unable to determine base asset for ${trade.symbol}`);
    }

    // Initial balance check (will be updated if additional settlement delay needed)
    console.log(`[OCO] ${trade.symbol} - Initial balance check for ${baseAsset}...`);
    const initialAccountInfo = await client.getAccount();
    const initialAssetBalance = initialAccountInfo.balances.find(b => b.asset === baseAsset);
    const currentAvailableBalance = parseFloat(initialAssetBalance?.free || '0'); // Current balance (may already include settlement)
    const initialLockedBalance = parseFloat(initialAssetBalance?.locked || '0');

    // CRITICAL FIX: Use preBuyBalance from Trade document (captured BEFORE buy order)
    // If not available (old trades), fall back to current balance (assumes no settlement yet)
    const preBuyBalance = trade.preBuyBalance !== undefined
      ? trade.preBuyBalance
      : currentAvailableBalance;

    console.log(
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

    console.log(
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
      console.log(
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

      console.log(
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

        console.log(
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
          console.log(
            `[OCO] ${trade.symbol} - Settlement verified after ${poll}/${maxPolls} polls ` +
            `(${elapsedTime}ms elapsed, ${savedTime}ms saved). ` +
            `Balance increased by ${balanceIncrease.toFixed(8)} ${baseAsset}`
          );
          break;
        }

        if (poll < maxPolls) {
          console.log(`[OCO] ${trade.symbol} - Waiting ${pollInterval}ms before next poll...`);
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
    // Only cancels orders that aren't tracked in our database - never touches legitimate OCO orders
    console.log(`[OCO] ${trade.symbol} - Checking for phantom orders...`);

    try {
      // 1. Get all open SELL orders for this symbol from Binance
      const openOrders = await client.getOpenOrders(trade.symbol);
      const openSellOrders = openOrders.filter(order => order.side === "SELL");

      console.log(
        `[OCO] ${trade.symbol} - Found ${openSellOrders.length} open SELL orders on Binance`
      );

      if (openSellOrders.length > 0) {
        // 2. Get all legitimate orderListIds from our database for this user and symbol
        const userTrades = await Trade.find({
          userId: trade.userId,
          symbol: trade.symbol,
          status: { $in: ["open", "partial"] }, // Only active trades
          "sellOrders.0": { $exists: true }, // Has at least one sell order
        }).select("sellOrders").lean();

        // Extract all legitimate orderListIds (filter out -1 which means no order list)
        const legitimateOrderListIds = new Set<number>();
        userTrades.forEach(t => {
          const sellOrders = t.sellOrders as Array<{ orderListId?: number }> | undefined;
          sellOrders?.forEach(order => {
            if (order.orderListId && order.orderListId !== -1) {
              legitimateOrderListIds.add(order.orderListId);
            }
          });
        });

        console.log(
          `[OCO] ${trade.symbol} - Legitimate orderListIds in database: ` +
          `[${Array.from(legitimateOrderListIds).join(", ")}]`
        );

        // CRITICAL SAFETY CHECK: If database returns empty but Binance has orders,
        // this could indicate database inconsistency. Skip cleanup to avoid deleting
        // legitimate orders. This prevents data loss if database is temporarily out of sync.
        if (legitimateOrderListIds.size === 0 && openSellOrders.length > 0) {
          console.warn(
            `[OCO] ${trade.symbol} - SAFETY: Skipping phantom cleanup. ` +
            `Database shows no legitimate orders but Binance has ${openSellOrders.length} open SELL orders. ` +
            `This indicates potential database inconsistency. Manual cleanup recommended.`
          );
          // Continue with OCO creation despite potential phantom orders
          // This is safer than accidentally canceling legitimate orders
        } else {
          // 3. Identify phantom orders (orders not in our database)
          const phantomOrders = openSellOrders.filter(order => {
            // Skip orders without orderListId or with -1 (not part of OCO)
            if (!order.orderListId || order.orderListId === -1) {
              return false;
            }
            // Phantom = orderListId exists but not in our database
            return !legitimateOrderListIds.has(order.orderListId);
          });

          console.log(
            `[OCO] ${trade.symbol} - Found ${phantomOrders.length} phantom orders ` +
            `(orderListIds: [${phantomOrders.map(o => o.orderListId).filter((v, i, a) => a.indexOf(v) === i).join(", ")}])`
          );

          // 4. Cancel phantom orders by orderListId (cancels entire OCO group)
          const canceledOrderListIds = new Set<number>();
          for (const order of phantomOrders) {
            // Skip if we already canceled this orderListId
            if (canceledOrderListIds.has(order.orderListId!)) {
              continue;
            }

            try {
              console.log(
                `[OCO] ${trade.symbol} - Canceling phantom orderListId ${order.orderListId} ` +
                `(orderId: ${order.orderId})`
              );
              await client.cancelOCOOrder(trade.symbol, order.orderListId!);
              canceledOrderListIds.add(order.orderListId!);
              console.log(
                `[OCO] ${trade.symbol} - Successfully canceled phantom orderListId ${order.orderListId}`
              );
            } catch (cancelError: unknown) {
              // Log but don't fail - phantom order cleanup is best-effort
              console.warn(
                `[OCO] ${trade.symbol} - Failed to cancel phantom orderListId ${order.orderListId}:`,
                cancelError instanceof Error ? cancelError.message : String(cancelError)
              );
            }
          }

          if (canceledOrderListIds.size > 0) {
            console.log(
              `[OCO] ${trade.symbol} - Phantom order cleanup complete. ` +
              `Canceled ${canceledOrderListIds.size} orderListId(s): ` +
              `[${Array.from(canceledOrderListIds).join(", ")}]`
            );
          } else {
            console.log(`[OCO] ${trade.symbol} - No phantom orders to clean up`);
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
    console.log(
      `[OCO] ${trade.symbol} - Using ${targets.length} target(s) with distribution: ` +
      `${distribution.map(d => d.toFixed(2)).join("%, ")}%`
    );

    let totalAllocatedQty = 0;
    // CRITICAL: Use actualQuantity (executed qty) not trade.quantity to prevent over-allocation on partial fills
    const ALLOCATION_CAP = actualQuantity; // Maximum we can allocate (100%)

    for (let i = 0; i < targets.length; i++) {
      // CRITICAL FIX: Fetch fresh balance BEFORE each OCO creation
      // Previous OCO orders lock coins on Binance, reducing available balance
      console.log(`[OCO] ${trade.symbol} - Fetching fresh balance before OCO ${i}...`);
      const currentAccountInfo = await client.getAccount();
      const currentAssetBalance = currentAccountInfo.balances.find(b => b.asset === baseAsset);
      const currentAvailableBalance = parseFloat(currentAssetBalance?.free || '0');
      const currentLockedBalance = parseFloat(currentAssetBalance?.locked || '0');

      console.log(
        `[OCO] ${trade.symbol} - Fresh balance before OCO ${i}:`,
        `Available=${currentAvailableBalance.toFixed(8)},`,
        `Locked=${currentLockedBalance.toFixed(8)},`,
        `Locked by previous OCOs=${(currentLockedBalance - initialLockedBalance).toFixed(8)}`
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
      // (previous OCO orders may have locked coins on Binance)
      if (adjustedQty > currentAvailableBalance - TRADE_EXECUTION.BALANCE_TOLERANCE) {
        const originalQty = adjustedQty;
        adjustedQty = currentAvailableBalance;

        console.warn(
          `[OCO] ${trade.symbol} - Insufficient free balance for target ${i}. ` +
          `Requested: ${originalQty.toFixed(8)}, Available: ${currentAvailableBalance.toFixed(8)}. ` +
          `Adjusting quantity to use all remaining balance.`
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

      // eslint-disable-next-line no-console
      console.log(`[OCO] ${trade.symbol} - Creating OCO for target ${i + 1}/${targets.length}:`, {
        symbol: trade.symbol,
        targetPrice: targetPrice,
        adjustedPrice: adjustedPrice,
        quantity: qtyForTarget.toFixed(8),
        adjustedQty: adjustedQty.toFixed(8),
        currentFreeBalance: currentAvailableBalance.toFixed(8),
        percentage: `${percentage}%`,
        originalStopLoss: trade.stopLoss,
        adjustedStopLoss: adjustedStopLoss,
        adjustedStopPrice: adjustedStopPrice,
        rawStopLimitPrice: rawStopLimitPrice,
        adjustedStopLimitPrice: adjustedStopLimitPrice,
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

        // Log successful OCO creation
        console.log(
          `[OCO] ${trade.symbol} - OCO ${i} created successfully. ` +
          `Locked ${adjustedQty.toFixed(8)} ${baseAsset} (${percentage}% of position). ` +
          `Total allocated so far: ${totalAllocatedQty.toFixed(8)} / ${ALLOCATION_CAP.toFixed(8)} ${baseAsset} ` +
          `(${(totalAllocatedQty / ALLOCATION_CAP * 100).toFixed(2)}%)`
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
        console.error(`Failed to create OCO for target ${i}:`, error);
      }
    }

    // Validate that allocated quantity matches buy quantity
    const unallocatedQty = trade.quantity - totalAllocatedQty;
    const allocationPercentage = (totalAllocatedQty / trade.quantity) * 100;

    if (Math.abs(unallocatedQty) > TRADE_EXECUTION.BALANCE_TOLERANCE) { // Floating point tolerance
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

    // Send notification if targets were adjusted and user hasn't been notified yet
    if (targetAdjustmentReason && !trade.targetAdjustmentNotificationSent) {
      console.log(`[OCO Creation] Sending target adjustment notification for ${trade.symbol}...`);

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

      console.log(`[OCO Creation] Error persisted to database:`, {
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
