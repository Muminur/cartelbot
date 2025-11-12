import { Trade, Signal } from "@/lib/db/models";
import { BinanceWebSocketEvent } from "./websocket-manager";
import { markSignalCompleted } from "./signal-status-manager";

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
          const totalExecutedQty = trade.sellOrders.reduce(
            (sum: number, order: { executedQty: number }) => sum + order.executedQty,
            0
          );

          if (totalExecutedQty >= trade.quantity * 0.99) {
            trade.status = "closed";
            trade.closeReason = "target";

            const totalSellValue = trade.sellOrders.reduce(
              (sum: number, order: { cummulativeQuoteQty: number }) =>
                sum + order.cummulativeQuoteQty,
              0
            );
            trade.realizedPnL = totalSellValue - trade.investedAmount;
            trade.exitPrice = totalSellValue / totalExecutedQty;

            // Update signal status when trade closes
            if (trade.signalId) {
              await markSignalCompleted(trade.signalId, trade._id, "target");
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
      console.log(`Balance update: ${balance.a} - Free: ${free}, Locked: ${locked}`);
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

    for (const order of data.O as Array<{ s: string; i: number; c: string }>) {
      const trade = await Trade.findOne({
        "sellOrders.orderId": order.i,
      });

      if (trade) {
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
              const totalSellValue = filledOrders.reduce(
                (sum: number, order: { cummulativeQuoteQty: number }) =>
                  sum + order.cummulativeQuoteQty,
                0
              );
              const totalExecutedQty = filledOrders.reduce(
                (sum: number, order: { executedQty: number }) => sum + order.executedQty,
                0
              );

              trade.exitPrice = totalSellValue / totalExecutedQty;
              trade.realizedPnL = totalSellValue - trade.investedAmount;
              trade.status = "closed";

              if (data.r === "STOP_LOSS_LIMIT") {
                trade.closeReason = "stop_loss";
              } else {
                trade.closeReason = "target";
              }

              await trade.save();

              // Update signal status when trade closes (via OCO list status)
              if (trade.signalId) {
                const reason = data.r === "STOP_LOSS_LIMIT" ? "stop_loss" : "target";
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
        console.log(`Unhandled event type: ${event.eventType}`);
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
