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

    console.log(`[Trade Executor] Executing buy order for ${signal.symbol}:`, {
      symbol: signal.symbol,
      investmentAmount: amount,
      estimatedQuantity: estimatedQuantity,
      currentPrice: currentPrice,
      testnet: testnet,
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

    // CRITICAL: Validate targets against executed price for OCO compatibility
    // Binance OCO rule for SELL: price > market price > stopPrice
    const invalidTargets = signal.targets.filter((target: number) => target <= executedPrice);
    if (invalidTargets.length > 0) {
      throw new ValidationError(
        `Signal targets are invalid for OCO sell orders. ` +
        `Buy executed at ${executedPrice.toFixed(8)}, but ${invalidTargets.length} target(s) are below this price: ` +
        `${invalidTargets.map((t: number) => t.toFixed(8)).join(', ')}. ` +
        `For SELL OCO orders, target prices must be ABOVE the entry price. ` +
        `This can happen when market price moves up between signal creation and execution.`
      );
    }

    // Validate stop loss is below executed price
    if (signal.stopLoss >= executedPrice) {
      throw new ValidationError(
        `Stop loss (${signal.stopLoss.toFixed(8)}) must be BELOW entry price (${executedPrice.toFixed(8)}) for sell orders.`
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
      targets: signal.targets,
      stopLoss: signal.stopLoss,
    });

    console.log(`[Trade Executor] Trade document created:`, {
      tradeId: trade._id,
      symbol: trade.symbol,
      quantity: trade.quantity,
      entryPrice: trade.entryPrice,
      investedAmount: trade.investedAmount,
      status: trade.status,
      targets: trade.targets,
      stopLoss: trade.stopLoss,
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
    const distribution = TRADE_DEFAULTS.TARGET_DISTRIBUTION; // [75, 15, 10]
    const maxOCOOrders = distribution.length; // Limit to 3 OCO orders
    const targets = trade.targets.slice(0, maxOCOOrders); // Take only first 3 targets
    const orders: OCOOrderResult[] = [];

    // Use baseAsset from symbol info with fallback to string parsing
    const baseAsset = symbolInfo.baseAsset || trade.symbol.replace(/USDT$/, '');
    if (!baseAsset) {
      throw new ValidationError(`Unable to determine base asset for ${trade.symbol}`);
    }

    // Initial balance check (will be updated if additional settlement delay needed)
    console.log(`[OCO] ${trade.symbol} - Initial balance check for ${baseAsset}...`);
    const initialAccountInfo = await client.getAccount();
    const initialAssetBalance = initialAccountInfo.balances.find(b => b.asset === baseAsset);
    let initialAvailableBalance = parseFloat(initialAssetBalance?.free || '0'); // Use 'let' - may be updated after recheck
    const initialLockedBalance = parseFloat(initialAssetBalance?.locked || '0');

    console.log(
      `[OCO] ${trade.symbol} - Initial balance:`,
      `Available=${initialAvailableBalance.toFixed(8)},`,
      `Locked=${initialLockedBalance.toFixed(8)},`,
      `Required (from buy order)=${trade.quantity.toFixed(8)},`,
      `Buy Order ID=${trade.buyOrder?.orderId || 'N/A'},`,
      `Buy Order Executed Qty=${trade.buyOrder?.executedQty?.toFixed(8) || 'N/A'},`,
      `Shortfall=${Math.max(0, trade.quantity - initialAvailableBalance).toFixed(8)}`
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

    // IMPORTANT: After the proactive settlement delay (2-3 seconds), the balance should already
    // contain the purchased coins. We check if balance >= required quantity, NOT if it increased.
    // The "beforeSettlementBalance" is the balance BEFORE the buy order (captured in initial balance check).
    console.log(
      `[OCO] ${trade.symbol} - Verifying settlement: ` +
      `Current balance=${initialAvailableBalance.toFixed(8)}, ` +
      `Required quantity=${actualQuantity.toFixed(8)}, ` +
      `Sufficient=${initialAvailableBalance >= actualQuantity ? 'YES' : 'NO'}`
    );

    // Check if balance is already sufficient (settlement likely already complete due to proactive delay)
    if (initialAvailableBalance >= (actualQuantity - TRADE_EXECUTION.BALANCE_TOLERANCE)) {
      console.log(
        `[OCO] ${trade.symbol} - Balance already sufficient for OCO orders ` +
        `(${initialAvailableBalance.toFixed(8)} >= ${actualQuantity.toFixed(8)}). Proceeding immediately.`
      );
    } else {
      // Balance not yet sufficient - poll until it reaches required amount
      console.log(
        `[OCO] ${trade.symbol} - Balance insufficient (${initialAvailableBalance.toFixed(8)} < ${actualQuantity.toFixed(8)}). ` +
        `Polling for settlement...`
      );

      const maxPolls = testnet ? 20 : 10; // Testnet needs more time (up to 20 seconds)
      const pollInterval = 1000; // 1 second between polls
      let settlementVerified = false;

      const pollStartTime = Date.now();
      for (let poll = 1; poll <= maxPolls; poll++) {
        const currentAccount = await client.getAccount();
        const currentBalance = parseFloat(
          currentAccount.balances.find(b => b.asset === baseAsset)?.free || '0'
        );

        const settlementComplete = currentBalance >= (actualQuantity - TRADE_EXECUTION.BALANCE_TOLERANCE);

        console.log(
          `[OCO] ${trade.symbol} - Settlement poll ${poll}/${maxPolls}:`,
          `Current=${currentBalance.toFixed(8)},`,
          `Required=${actualQuantity.toFixed(8)},`,
          `Sufficient=${settlementComplete ? 'YES' : 'NO'}`
        );

        if (settlementComplete) {
          settlementVerified = true;
          initialAvailableBalance = currentBalance;
          const elapsedTime = Date.now() - pollStartTime;
          const savedTime = (maxPolls - poll) * pollInterval;
          console.log(
            `[OCO] ${trade.symbol} - Settlement verified after ${poll}/${maxPolls} polls ` +
            `(${elapsedTime}ms elapsed, ${savedTime}ms saved)`
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

        if (finalBalance >= (actualQuantity - TRADE_EXECUTION.BALANCE_TOLERANCE)) {
          console.warn(
            `[OCO] ${trade.symbol} - Final check passed: balance is sufficient ` +
            `(${finalBalance.toFixed(8)} >= ${actualQuantity.toFixed(8)}). Proceeding...`
          );
          initialAvailableBalance = finalBalance;
        } else {
          throw new ValidationError(
            `Balance settlement verification failed after ${maxPolls} polls. ` +
            `Final balance: ${finalBalance.toFixed(8)}, Required: ${actualQuantity.toFixed(8)}, ` +
            `Shortfall: ${(actualQuantity - finalBalance).toFixed(8)}. ` +
            `This indicates persistent testnet settlement delays or balance sync issues.`
          );
        }
      }
    }


    // Log warning if signal has more targets than distribution
    if (trade.targets.length > maxOCOOrders) {
      console.warn(
        `Signal has ${trade.targets.length} targets, but only ${maxOCOOrders} will be used ` +
        `for OCO orders (distribution: ${distribution.join(", ")}%). ` +
        `Skipping targets: ${trade.targets.slice(maxOCOOrders).join(", ")}`
      );
    }

    let totalAllocatedQty = 0;
    let remainingFreeBalance = initialAvailableBalance; // Track balance as orders lock coins
    // CRITICAL: Use actualQuantity (executed qty) not trade.quantity to prevent over-allocation on partial fills
    const ALLOCATION_CAP = actualQuantity; // Maximum we can allocate (100%)

    for (let i = 0; i < targets.length; i++) {
      const targetPrice = targets[i];
      const percentage = distribution[i]; // Safe - always within bounds (no fallback needed)
      // CRITICAL: Calculate OCO quantity based on ACTUAL executed quantity, not planned quantity
      const qtyForTarget = (actualQuantity * percentage) / 100;

      // Validate and adjust target price and quantity
      const validation = validateAllFilters(targetPrice, qtyForTarget, filters);
      if (!validation.isValid) {
        console.warn(`Skipping target ${i} due to filter validation: ${validation.errors.join(", ")}`);
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
      // (previous OCO orders may have locked coins)
      if (adjustedQty > remainingFreeBalance - TRADE_EXECUTION.BALANCE_TOLERANCE) {
        const originalQty = adjustedQty;
        adjustedQty = remainingFreeBalance;

        console.warn(
          `[OCO] ${trade.symbol} - Insufficient free balance for target ${i}. ` +
          `Requested: ${originalQty.toFixed(8)}, Available: ${remainingFreeBalance.toFixed(8)}. ` +
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
        remainingFreeBalance: remainingFreeBalance.toFixed(8),
        stopLoss: trade.stopLoss,
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
        const ocoOrder = await retryOCOCreation(
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

        orders.push({
          orderId: ocoOrder.orderId,
          status: ocoOrder.status,
          transactTime: ocoOrder.transactTime,
        });
        totalAllocatedQty += adjustedQty;

        // Decrement remaining free balance as this order locks coins
        remainingFreeBalance -= adjustedQty;
        console.log(
          `[OCO] ${trade.symbol} - OCO ${i} locked ${adjustedQty.toFixed(8)} ${baseAsset}. ` +
          `Remaining free balance: ${remainingFreeBalance.toFixed(8)} ${baseAsset}`
        );

        trade.sellOrders.push({
          orderId: ocoOrder.orderId,
          orderListId: ocoOrder.orderListId, // Store orderListId for easy cancellation
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
