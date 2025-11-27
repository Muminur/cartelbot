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

    const trade = await Trade.findOne({
      $or: [
        { "buyOrder.orderId": data.i },
        { "sellOrders.orderId": data.i },
      ],
    });

    if (!trade) {
      console.warn(`Trade not found for orderId: ${data.i}`);
      return;
    }

    const orderStatus = data.X;
    const executedQty = parseFloat(data.z);
    const cummulativeQuoteQty = parseFloat(data.Z);

    if (data.i === trade.buyOrder.orderId) {
      trade.buyOrder.status = orderStatus;
      trade.buyOrder.executedQty = executedQty;
      trade.buyOrder.cummulativeQuoteQty = cummulativeQuoteQty;

      if (orderStatus === "FILLED") {
        const avgPrice = cummulativeQuoteQty / executedQty;
        trade.entryPrice = avgPrice;

        // NOTE: Buy order notification is already sent from the execute endpoint
        // (app/api/trades/execute/route.ts line 100) after OCO creation succeeds.
        // We do NOT send notification here to avoid duplicate emails.
        // Only SELL orders (targets and stop loss) trigger notifications from WebSocket events.
      }
    } else {
      const sellOrderIndex = trade.sellOrders.findIndex(
        (order: { orderId: number }) => order.orderId === data.i
      );

      if (sellOrderIndex !== -1) {
        trade.sellOrders[sellOrderIndex].status = orderStatus;
        trade.sellOrders[sellOrderIndex].executedQty = executedQty;
        trade.sellOrders[sellOrderIndex].cummulativeQuoteQty = cummulativeQuoteQty;

        if (orderStatus === "FILLED") {
          const currentOrder = trade.sellOrders[sellOrderIndex];
          const isStopLoss = currentOrder.type === "STOP_LOSS_LIMIT";

          // Send notification based on order type
          if (isStopLoss) {
            // Stop Loss Hit - Calculate loss proportionally
            const avgBuyPrice = trade.buyOrder.cummulativeQuoteQty / trade.buyOrder.executedQty;
            const buyCostForThisQuantity = avgBuyPrice * executedQty;
            const loss = cummulativeQuoteQty - buyCostForThisQuantity;

            sendStopLossHitNotification({
              userId: trade.userId,
              tradeId: trade._id,
              symbol: data.s,
              stopLossPrice: currentOrder.stopPrice || currentOrder.price,
              executedQuantity: executedQty,
              loss: loss,
              timestamp: new Date(data.T),
              orderId: data.i,
            }).catch((error) => {
              console.error("[Notification] Failed to send stop loss email:", error);
            });
          } else {
            // Target Hit (Take Profit) - Calculate profit proportionally
            const avgBuyPrice = trade.buyOrder.cummulativeQuoteQty / trade.buyOrder.executedQty;
            const buyCostForThisQuantity = avgBuyPrice * executedQty;
            const profit = cummulativeQuoteQty - buyCostForThisQuantity;

            const targetNumber = sellOrderIndex + 1; // TP #1, TP #2, etc.
            const remainingTargets = trade.sellOrders.filter(
              (order: { status: string; type: string }) =>
                order.status !== "FILLED" && order.type !== "STOP_LOSS_LIMIT"
            ).length;

            sendTargetHitNotification({
              userId: trade.userId,
              tradeId: trade._id,
              symbol: data.s,
              targetNumber: targetNumber,
              targetPrice: currentOrder.price,
              executedQuantity: executedQty,
              revenue: profit,
              timestamp: new Date(data.T),
              orderId: data.i,
              remainingTargets: remainingTargets,
            }).catch((error) => {
              console.error("[Notification] Failed to send target hit email:", error);
            });
          }

          const totalExecutedQty = trade.sellOrders.reduce(
            (sum: number, order: { executedQty: number }) => sum + order.executedQty,
            0
          );

          if (totalExecutedQty >= trade.quantity * 0.99) {
            trade.status = "closed";
            trade.closeReason = isStopLoss ? "stop_loss" : "target";
            trade.closeReasonDetail = isStopLoss ? "Stop Loss Hit" : "Target Hit";

            // Get actual buy cost from Binance (what was actually spent)
            const buyCost = trade.buyOrder.cummulativeQuoteQty;

            // Get actual sell revenue from filled orders (what was actually received)
            const sellRevenue = trade.sellOrders.reduce(
              (sum: number, order: { cummulativeQuoteQty: number }) =>
                sum + order.cummulativeQuoteQty,
              0
            );

            // FIX: Realized P&L = Sell Revenue - Buy Cost (both from Binance API, not user input)
            trade.realizedPnL = sellRevenue - buyCost;
            trade.exitPrice = sellRevenue / totalExecutedQty;

            // Update signal status when trade closes
            if (trade.signalId) {
              await markSignalCompleted(
                trade.signalId,
                trade._id,
                isStopLoss ? "stop_loss" : "target"
              );
            }
          } else {
            trade.status = "partial";
          }
        }
      }
    }

    await trade.save();
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

    // Track processed trade IDs to avoid duplicate processing
    // (data.O contains multiple orders that may belong to the same trade)
    const processedTradeIds = new Set<string>();

    for (const order of data.O as Array<{ s: string; i: number; c: string }>) {
      const trade = await Trade.findOne({
        "sellOrders.orderId": order.i,
      });

      if (trade) {
        // Skip if we've already processed this trade in this event
        const tradeIdStr = trade._id.toString();
        if (processedTradeIds.has(tradeIdStr)) {
          continue;
        }
        processedTradeIds.add(tradeIdStr);

        if (data.l === "ALL_DONE") {
          const allFilled = trade.sellOrders.every(
            (sellOrder: { status: string }) =>
              sellOrder.status === "FILLED" || sellOrder.status === "CANCELED"
          );

          if (allFilled) {
            const filledOrders = trade.sellOrders.filter(
              (order: { status: string }) => order.status === "FILLED"
            );

            if (filledOrders.length > 0) {
              // Get actual buy cost from Binance (what was actually spent)
              const buyCost = trade.buyOrder.cummulativeQuoteQty;

              // Get actual sell revenue from filled orders (what was actually received)
              const sellRevenue = filledOrders.reduce(
                (sum: number, order: { cummulativeQuoteQty: number }) =>
                  sum + order.cummulativeQuoteQty,
                0
              );
              const totalExecutedQty = filledOrders.reduce(
                (sum: number, order: { executedQty: number }) => sum + order.executedQty,
                0
              );

              trade.exitPrice = sellRevenue / totalExecutedQty;

              // FIX: Realized P&L = Sell Revenue - Buy Cost (both from Binance API, not user input)
              trade.realizedPnL = sellRevenue - buyCost;
              trade.status = "closed";

              const isStopLoss = data.r === "STOP_LOSS_LIMIT";

              if (isStopLoss) {
                trade.closeReason = "stop_loss";
                trade.closeReasonDetail = "Stop Loss Hit";
                // NOTE: Stop loss notification is already sent from handleExecutionReport
                // when the individual STOP_LOSS_LIMIT order is FILLED.
                // We do NOT send notification here to avoid duplicate emails.
              } else {
                trade.closeReason = "target";
                trade.closeReasonDetail = "Target Hit";
                // NOTE: Target hit notification is already sent from handleExecutionReport
                // when each individual target order is FILLED.
                // We do NOT send notification here to avoid duplicate emails.
              }

              await trade.save();

              // Update signal status when trade closes (via OCO list status)
              if (trade.signalId) {
                const reason = isStopLoss ? "stop_loss" : "target";
                await markSignalCompleted(trade.signalId, trade._id, reason);
              }
            }
          }
        }
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

