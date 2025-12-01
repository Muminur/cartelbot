import { Trade, Signal } from "@/lib/db/models";
import { BinanceWebSocketEvent } from "./websocket-manager";
import { markSignalCompleted } from "./signal-status-manager";
import {
  sendTargetHitNotification,
  sendStopLossHitNotification,
} from "@/lib/email/notifications";

interface ExecutionReportEvent {
  e: "executionReport";
  E: number;
  s: string;
  c: string;
  S: "BUY" | "SELL";
  o: string;
  f: string;
  q: string;
  p: string;
  P: string;
  F: string;
  g: number;
  C: string;
  x: string;
  X: string;
  r: string;
  i: number;
  l: string;
  z: string;
  L: string;
  n: string;
  N: string;
  T: number;
  t: number;
  I: number;
  w: boolean;
  m: boolean;
  M: boolean;
  O: number;
  Z: string;
  Y: string;
  Q: string;
}

interface OutboundAccountPositionEvent {
  e: "outboundAccountPosition";
  E: number;
  u: number;
  B: Array<{
    a: string;
    f: string;
    l: string;
  }>;
}

interface ListStatusEvent {
  e: "listStatus";
  E: number;
  s: string;
  g: number;
  c: string;
  l: string;
  L: string;
  r: string;
  C: string;
  T: number;
  O: Array<{
    s: string;
    i: number;
    c: string;
  }>;
}

export async function handleExecutionReport(event: BinanceWebSocketEvent): Promise<void> {
  try {
    const data = event.data as unknown as ExecutionReportEvent;
    const orderId = data.i;
    const orderStatus = data.X;
    const executedQty = parseFloat(data.z);
    const cummulativeQuoteQty = parseFloat(data.Z);

    // Try buy order update first (atomic)
    const buyOrderUpdate: Record<string, unknown> = {
      "buyOrder.status": orderStatus,
      "buyOrder.executedQty": executedQty,
      "buyOrder.cummulativeQuoteQty": cummulativeQuoteQty,
    };

    if (orderStatus === "FILLED") {
      buyOrderUpdate.entryPrice = cummulativeQuoteQty / executedQty;
    }

    const buyResult = await Trade.findOneAndUpdate(
      { "buyOrder.orderId": orderId },
      { $set: buyOrderUpdate },
      { new: true }
    );

    if (buyResult) {
      // Buy order updated successfully - no notification here (sent from execute endpoint)
      return;
    }

    // Try sell order update (atomic) - use positional $ operator
    const sellOrderUpdate = await Trade.findOneAndUpdate(
      { "sellOrders.orderId": orderId },
      {
        $set: {
          "sellOrders.$.status": orderStatus,
          "sellOrders.$.executedQty": executedQty,
          "sellOrders.$.cummulativeQuoteQty": cummulativeQuoteQty,
        },
      },
      { new: true }
    );

    if (!sellOrderUpdate) {
      console.warn(`Trade not found for orderId: ${orderId}`);
      return;
    }

    // Find which sell order was updated and handle notifications
    const sellOrderIndex = sellOrderUpdate.sellOrders.findIndex(
      (order: { orderId: number }) => order.orderId === orderId
    );

    if (sellOrderIndex === -1 || orderStatus !== "FILLED") {
      return;
    }

    const currentOrder = sellOrderUpdate.sellOrders[sellOrderIndex];
    const isStopLoss = currentOrder.type === "STOP_LOSS_LIMIT";

    // Send notification based on order type
    if (isStopLoss) {
      const avgBuyPrice = sellOrderUpdate.buyOrder.cummulativeQuoteQty / sellOrderUpdate.buyOrder.executedQty;
      const buyCostForThisQuantity = avgBuyPrice * executedQty;
      const loss = cummulativeQuoteQty - buyCostForThisQuantity;

      sendStopLossHitNotification({
        userId: sellOrderUpdate.userId,
        tradeId: sellOrderUpdate._id,
        symbol: data.s,
        stopLossPrice: currentOrder.stopPrice || currentOrder.price,
        executedQuantity: executedQty,
        loss: loss,
        timestamp: new Date(data.T),
        orderId: orderId,
      }).catch((error) => {
        console.error("[Notification] Failed to send stop loss email:", error);
      });
    } else {
      const avgBuyPrice = sellOrderUpdate.buyOrder.cummulativeQuoteQty / sellOrderUpdate.buyOrder.executedQty;
      const buyCostForThisQuantity = avgBuyPrice * executedQty;
      const profit = cummulativeQuoteQty - buyCostForThisQuantity;

      const targetNumber = sellOrderIndex + 1;
      const remainingTargets = sellOrderUpdate.sellOrders.filter(
        (order: { status: string; type: string }) =>
          order.status !== "FILLED" && order.type !== "STOP_LOSS_LIMIT"
      ).length;

      sendTargetHitNotification({
        userId: sellOrderUpdate.userId,
        tradeId: sellOrderUpdate._id,
        symbol: data.s,
        targetNumber: targetNumber,
        targetPrice: currentOrder.price,
        executedQuantity: executedQty,
        revenue: profit,
        timestamp: new Date(data.T),
        orderId: orderId,
        remainingTargets: remainingTargets,
      }).catch((error) => {
        console.error("[Notification] Failed to send target hit email:", error);
      });
    }

    // Check if trade should be closed (atomic update)
    const totalExecutedQty = sellOrderUpdate.sellOrders.reduce(
      (sum: number, order: { executedQty: number }) => sum + order.executedQty,
      0
    );

    if (totalExecutedQty >= sellOrderUpdate.quantity * 0.99) {
      const buyCost = sellOrderUpdate.buyOrder.cummulativeQuoteQty;
      const sellRevenue = sellOrderUpdate.sellOrders.reduce(
        (sum: number, order: { cummulativeQuoteQty: number }) =>
          sum + order.cummulativeQuoteQty,
        0
      );

      // Atomic trade close update
      await Trade.findByIdAndUpdate(sellOrderUpdate._id, {
        $set: {
          status: "closed",
          closeReason: isStopLoss ? "stop_loss" : "target",
          closeReasonDetail: isStopLoss ? "Stop Loss Hit" : "Target Hit",
          realizedPnL: sellRevenue - buyCost,
          exitPrice: sellRevenue / totalExecutedQty,
        },
      });

      // Update signal status when trade closes
      if (sellOrderUpdate.signalId) {
        await markSignalCompleted(
          sellOrderUpdate.signalId,
          sellOrderUpdate._id,
          isStopLoss ? "stop_loss" : "target"
        );
      }
    } else if (sellOrderUpdate.status !== "partial") {
      // Atomic partial status update
      await Trade.findByIdAndUpdate(sellOrderUpdate._id, {
        $set: { status: "partial" },
      });
    }
  } catch (error) {
    const data = event.data as unknown as ExecutionReportEvent;
    console.error("Error handling executionReport:", {
      error: error instanceof Error ? error.message : String(error),
      orderId: data.i,
      symbol: data.s,
      eventTime: event.eventTime,
    });
    throw error;
  }
}

export async function handleOutboundAccountPosition(event: BinanceWebSocketEvent): Promise<void> {
  try {
    const data = event.data as unknown as OutboundAccountPositionEvent;

    data.B.forEach((balance: { a: string; f: string; l: string }) => {
      const free = parseFloat(balance.f);
      const locked = parseFloat(balance.l);
      if (process.env.NODE_ENV !== 'production') console.log(`Balance update: ${balance.a} - Free: ${free}, Locked: ${locked}`);
    });
  } catch (error) {
    console.error("Error handling outboundAccountPosition:", {
      error: error instanceof Error ? error.message : String(error),
      eventTime: event.eventTime,
    });
  }
}

export async function handleListStatus(event: BinanceWebSocketEvent): Promise<void> {
  try {
    const data = event.data as unknown as ListStatusEvent;

    // Only process ALL_DONE status
    if (data.l !== "ALL_DONE") {
      return;
    }

    // Track processed trade IDs to avoid duplicate processing
    const processedTradeIds = new Set<string>();

    for (const order of data.O as Array<{ s: string; i: number; c: string }>) {
      // Find trade without modifying (lean query for read-only)
      interface LeanTrade {
        _id: string;
        signalId?: string;
        buyOrder: { cummulativeQuoteQty: number };
        sellOrders: Array<{
          status: string;
          cummulativeQuoteQty: number;
          executedQty: number;
        }>;
      }
      const trade = await Trade.findOne({
        "sellOrders.orderId": order.i,
      }).lean() as LeanTrade | null;

      if (!trade) continue;

      // Skip if we've already processed this trade in this event
      const tradeIdStr = String(trade._id);
      if (processedTradeIds.has(tradeIdStr)) {
        continue;
      }
      processedTradeIds.add(tradeIdStr);

      const allFilled = trade.sellOrders.every(
        (sellOrder: { status: string }) =>
          sellOrder.status === "FILLED" || sellOrder.status === "CANCELED"
      );

      if (!allFilled) continue;

      const filledOrders = trade.sellOrders.filter(
        (order: { status: string }) => order.status === "FILLED"
      );

      if (filledOrders.length === 0) continue;

      // Calculate P&L values
      const buyCost = trade.buyOrder.cummulativeQuoteQty;
      const sellRevenue = filledOrders.reduce(
        (sum: number, order: { cummulativeQuoteQty: number }) =>
          sum + order.cummulativeQuoteQty,
        0
      );
      const totalExecutedQty = filledOrders.reduce(
        (sum: number, order: { executedQty: number }) => sum + order.executedQty,
        0
      );

      const isStopLoss = data.r === "STOP_LOSS_LIMIT";

      // Atomic update - prevents version conflicts
      await Trade.findByIdAndUpdate(trade._id, {
        $set: {
          status: "closed",
          closeReason: isStopLoss ? "stop_loss" : "target",
          closeReasonDetail: isStopLoss ? "Stop Loss Hit" : "Target Hit",
          exitPrice: sellRevenue / totalExecutedQty,
          realizedPnL: sellRevenue - buyCost,
        },
      });

      // Update signal status when trade closes
      // NOTE: Notifications are already sent from handleExecutionReport
      if (trade.signalId) {
        const reason = isStopLoss ? "stop_loss" : "target";
        await markSignalCompleted(trade.signalId, trade._id, reason);
      }
    }
  } catch (error) {
    const data = event.data as unknown as ListStatusEvent;
    console.error("Error handling listStatus:", {
      error: error instanceof Error ? error.message : String(error),
      symbol: data.s,
      orderListId: data.g,
      eventTime: event.eventTime,
    });
  }
}

export async function routeEvent(event: BinanceWebSocketEvent): Promise<void> {
  try {
    switch (event.eventType) {
      case "executionReport":
        await handleExecutionReport(event);
        break;

      case "outboundAccountPosition":
        await handleOutboundAccountPosition(event);
        break;

      case "listStatus":
        await handleListStatus(event);
        break;

      default:
        if (process.env.NODE_ENV !== 'production') console.log(`Unhandled event type: ${event.eventType}`);
        break;
    }
  } catch (error) {
    console.error("Error routing event:", {
      error: error instanceof Error ? error.message : String(error),
      eventType: event.eventType,
      eventTime: event.eventTime,
    });
  }
}

