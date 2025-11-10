import { BinanceClient } from "./client";
import { validateAllFilters } from "./filters";
import { getUserApiKeys } from "@/lib/db/helpers";
import { decrypt } from "@/lib/encryption";
import { Signal, Trade } from "@/lib/db/models";
import { connectDB } from "@/lib/db";
import { BinanceAPIError, ValidationError } from "@/lib/utils/errors";
import { TRADE_DEFAULTS } from "@/lib/constants";
import { Types } from "mongoose";

interface TradeExecutionParams {
  userId: Types.ObjectId;
  signalId: Types.ObjectId;
  investmentAmount?: number;
  testnet?: boolean;
}

interface TradeExecutionResult {
  success: boolean;
  tradeId?: Types.ObjectId;
  buyOrder?: any;
  error?: string;
}

export async function executeSignalTrade(
  params: TradeExecutionParams
): Promise<TradeExecutionResult> {
  const { userId, signalId, investmentAmount, testnet = false } = params;

  try {
    await connectDB();

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

    const apiKeys = await getUserApiKeys(userId as any);
    if (!apiKeys || !("encryptedApiKey" in apiKeys) || !("encryptedApiSecret" in apiKeys) || !apiKeys.encryptedApiKey || !apiKeys.encryptedApiSecret) {
      throw new ValidationError("Binance API keys not configured");
    }

    const apiKey = decrypt(apiKeys.encryptedApiKey as string);
    const apiSecret = decrypt(apiKeys.encryptedApiSecret as string);

    const client = new BinanceClient({ apiKey, apiSecret, testnet });

    await client.getServerTime();

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

    const amount = investmentAmount || TRADE_DEFAULTS.INVESTMENT_AMOUNT;

    if (amount < TRADE_DEFAULTS.MIN_INVESTMENT || amount > TRADE_DEFAULTS.MAX_INVESTMENT) {
      throw new ValidationError(
        `Investment amount must be between ${TRADE_DEFAULTS.MIN_INVESTMENT} and ${TRADE_DEFAULTS.MAX_INVESTMENT} USDT`
      );
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
        price: executedPrice,
        quantity: executedQty,
        status: buyOrder.status,
        transactTime: new Date(buyOrder.transactTime || Date.now()),
      },
      entryPrice: executedPrice,
      quantity: executedQty,
      investedAmount: amount,
      status: "open",
      targets: signal.targets,
      stopLoss: signal.stopLoss,
    });

    signal.status = "completed";
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

export async function createOCOOrders(
  tradeId: Types.ObjectId,
  testnet = false
): Promise<{ success: boolean; orders?: any[]; error?: string }> {
  try {
    await connectDB();

    const trade = await Trade.findById(tradeId);
    if (!trade) {
      throw new ValidationError("Trade not found");
    }

    const apiKeys = await getUserApiKeys(trade.userId as any);
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
    const distribution = TRADE_DEFAULTS.TARGET_DISTRIBUTION;
    const targets = trade.targets.slice(0, TRADE_DEFAULTS.MAX_TARGETS);
    const orders: any[] = [];

    let remainingQty = trade.quantity;

    for (let i = 0; i < targets.length; i++) {
      const targetPrice = targets[i];
      const percentage = distribution[i] || distribution[distribution.length - 1];
      const qtyForTarget = (trade.quantity * percentage) / 100;

      const validation = validateAllFilters(targetPrice, qtyForTarget, filters);
      if (!validation.isValid) {
        continue;
      }

      const adjustedQty = validation.adjustedQuantity || qtyForTarget;
      const adjustedPrice = validation.adjustedPrice || targetPrice;
      const stopLimitPrice = trade.stopLoss * 0.99;

      try {
        const ocoOrder = await client.createOCOOrder(
          trade.symbol,
          adjustedQty,
          adjustedPrice,
          trade.stopLoss,
          stopLimitPrice
        );

        orders.push(ocoOrder);
        remainingQty -= adjustedQty;

        trade.sellOrders.push({
          orderId: ocoOrder.orderId,
          price: adjustedPrice,
          quantity: adjustedQty,
          status: ocoOrder.status,
          transactTime: new Date(ocoOrder.transactTime || Date.now()),
        });
      } catch (error) {
        console.error(`Failed to create OCO for target ${i}:`, error);
      }
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
