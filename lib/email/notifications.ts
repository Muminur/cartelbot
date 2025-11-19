import { Resend } from "resend";
import { env } from "@/lib/config";
import { User } from "@/lib/db/models";
import { connectDB } from "@/lib/db";
import { Types } from "mongoose";
import { IUser } from "@/types";

let resend: Resend | null = null;

/**
 * Get or initialize Resend client
 */
function getResendClient(): Resend {
  if (!env.RESEND_API_KEY || !env.RESEND_API_KEY.startsWith("re_")) {
    console.error("RESEND_API_KEY is not configured or invalid");
    throw new Error("Email service not configured");
  }

  if (!resend) {
    resend = new Resend(env.RESEND_API_KEY);
    console.log("[Email] Resend client initialized for notifications");
  }

  return resend;
}

/**
 * Retry logic with exponential backoff
 */
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  initialDelay: number = 1000
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      if (
        error instanceof Error &&
        (error.message.includes("API key") || error.message.includes("authentication"))
      ) {
        throw error;
      }

      if (attempt < maxRetries - 1) {
        const delay = initialDelay * Math.pow(2, attempt);
        console.warn(`Email send attempt ${attempt + 1} failed. Retrying in ${delay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError || new Error("Max retries exceeded");
}

/**
 * Check if user has notifications enabled for a specific event type
 */
async function shouldSendNotification(
  userId: Types.ObjectId | string,
  notificationType: "onTradeExecuted" | "onTargetHit" | "onStopLossHit" | "dailySummary"
): Promise<{ shouldSend: boolean; email: string | null }> {
  try {
    await connectDB();

    const user = await User.findById(userId).select("email emailNotifications isActive");

    if (!user || !user.isActive) {
      return { shouldSend: false, email: null };
    }

    const emailNotifications = user.emailNotifications || {
      onTradeExecuted: true,
      onTargetHit: true,
      onStopLossHit: true,
      dailySummary: false,
    };

    const shouldSend = emailNotifications[notificationType] === true;

    return { shouldSend, email: user.email };
  } catch (error) {
    console.error("[Email] Error checking notification preferences:", error);
    return { shouldSend: false, email: null };
  }
}

/**
 * Base email template wrapper
 */
function createEmailTemplate(content: string): string {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background: #f5f5f5; }
          .container { max-width: 600px; margin: 20px auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; }
          .header h1 { color: white; margin: 0; font-size: 24px; }
          .content { padding: 30px; }
          .footer { background: #f9fafb; padding: 20px; text-align: center; font-size: 12px; color: #6b7280; }
          .badge { display: inline-block; padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: 600; }
          .badge-success { background: #dcfce7; color: #166534; }
          .badge-danger { background: #fee2e2; color: #991b1b; }
          .badge-warning { background: #fef3c7; color: #92400e; }
          .badge-info { background: #dbeafe; color: #1e40af; }
          .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin: 20px 0; }
          .info-item { background: #f9fafb; padding: 15px; border-radius: 6px; }
          .info-label { font-size: 12px; color: #6b7280; margin-bottom: 4px; }
          .info-value { font-size: 18px; font-weight: 600; color: #1f2937; }
          .btn { display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; margin: 10px 0; }
          .divider { border: none; border-top: 1px solid #e5e7eb; margin: 20px 0; }
          .text-success { color: #059669; font-weight: 600; }
          .text-danger { color: #dc2626; font-weight: 600; }
          .text-muted { color: #6b7280; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🤖 CartelBot</h1>
          </div>
          <div class="content">
            ${content}
          </div>
          <div class="footer">
            <p>CartelBot - Automated Binance Trading Bot</p>
            <p>This is an automated notification. Please do not reply.</p>
            <p><a href="${env.NEXT_PUBLIC_API_URL}/settings" style="color: #667eea;">Manage notification preferences</a></p>
          </div>
        </div>
      </body>
    </html>
  `;
}

/**
 * Send Trade Executed Notification
 */
export async function sendTradeExecutedNotification(data: {
  userId: Types.ObjectId | string;
  tradeId: Types.ObjectId | string;
  symbol: string;
  side: "BUY" | "SELL";
  quantity: number;
  price: number;
  totalAmount: number;
  timestamp: Date;
  orderId: number;
}): Promise<void> {
  try {
    const { shouldSend, email } = await shouldSendNotification(
      data.userId,
      "onTradeExecuted"
    );

    if (!shouldSend || !email) {
      console.log(`[Email] Notification disabled or email not found for user ${data.userId}`);
      return;
    }

    const client = getResendClient();

    const content = `
      <h2>✅ Trade Executed Successfully</h2>
      <p>Your ${data.side === "BUY" ? "buy" : "sell"} order has been executed on Binance.</p>

      <div class="info-grid">
        <div class="info-item">
          <div class="info-label">Symbol</div>
          <div class="info-value">${data.symbol}</div>
        </div>
        <div class="info-item">
          <div class="info-label">Side</div>
          <div class="info-value">
            <span class="badge ${data.side === "BUY" ? "badge-success" : "badge-warning"}">${data.side}</span>
          </div>
        </div>
        <div class="info-item">
          <div class="info-label">Quantity</div>
          <div class="info-value">${data.quantity.toFixed(6)}</div>
        </div>
        <div class="info-item">
          <div class="info-label">Execution Price</div>
          <div class="info-value">$${data.price.toFixed(6)}</div>
        </div>
        <div class="info-item">
          <div class="info-label">Total Amount</div>
          <div class="info-value class="text-success">$${data.totalAmount.toFixed(2)}</div>
        </div>
        <div class="info-item">
          <div class="info-label">Order ID</div>
          <div class="info-value">#${data.orderId}</div>
        </div>
      </div>

      <p class="text-muted">Executed at: ${data.timestamp.toLocaleString()}</p>

      <a href="${env.NEXT_PUBLIC_API_URL}/trades" class="btn">View Trade Details</a>
    `;

    await retryWithBackoff(async () => {
      const { error } = await client.emails.send({
        from: "CartelBot <noreply@cartelbot.coinspree.cc>",
        to: email,
        subject: `Trade Executed: ${data.symbol} ${data.side}`,
        html: createEmailTemplate(content),
      });

      if (error) {
        throw new Error(`Failed to send email: ${error.message}`);
      }

      console.log(`[Email] Trade executed notification sent to ${email}`);
    });
  } catch (error) {
    console.error("[Email] Error sending trade executed notification:", error);
  }
}

/**
 * Send Target Hit Notification
 */
export async function sendTargetHitNotification(data: {
  userId: Types.ObjectId | string;
  tradeId: Types.ObjectId | string;
  symbol: string;
  targetNumber: number;
  targetPrice: number;
  executedQuantity: number;
  revenue: number;
  timestamp: Date;
  orderId: number;
  remainingTargets: number;
}): Promise<void> {
  try {
    const { shouldSend, email } = await shouldSendNotification(data.userId, "onTargetHit");

    if (!shouldSend || !email) {
      console.log(`[Email] Target hit notification disabled for user ${data.userId}`);
      return;
    }

    const client = getResendClient();

    const content = `
      <h2>🎯 Target Hit!</h2>
      <p>Congratulations! Target #${data.targetNumber} has been reached for ${data.symbol}.</p>

      <div class="info-grid">
        <div class="info-item">
          <div class="info-label">Symbol</div>
          <div class="info-value">${data.symbol}</div>
        </div>
        <div class="info-item">
          <div class="info-label">Target #</div>
          <div class="info-value"><span class="badge badge-success">TP ${data.targetNumber}</span></div>
        </div>
        <div class="info-item">
          <div class="info-label">Target Price</div>
          <div class="info-value">$${data.targetPrice.toFixed(6)}</div>
        </div>
        <div class="info-item">
          <div class="info-label">Executed Quantity</div>
          <div class="info-value">${data.executedQuantity.toFixed(6)}</div>
        </div>
        <div class="info-item">
          <div class="info-label">Revenue</div>
          <div class="info-value text-success">+$${data.revenue.toFixed(2)}</div>
        </div>
        <div class="info-item">
          <div class="info-label">Remaining Targets</div>
          <div class="info-value">${data.remainingTargets}</div>
        </div>
      </div>

      <p class="text-muted">Executed at: ${data.timestamp.toLocaleString()}</p>
      <p class="text-muted">Order ID: #${data.orderId}</p>

      <a href="${env.NEXT_PUBLIC_API_URL}/trades" class="btn">View Trade Details</a>
    `;

    await retryWithBackoff(async () => {
      const { error } = await client.emails.send({
        from: "CartelBot <noreply@cartelbot.coinspree.cc>",
        to: email,
        subject: `🎯 Target #${data.targetNumber} Hit: ${data.symbol}`,
        html: createEmailTemplate(content),
      });

      if (error) {
        throw new Error(`Failed to send email: ${error.message}`);
      }

      console.log(`[Email] Target hit notification sent to ${email}`);
    });
  } catch (error) {
    console.error("[Email] Error sending target hit notification:", error);
  }
}

/**
 * Send Stop Loss Hit Notification
 */
export async function sendStopLossHitNotification(data: {
  userId: Types.ObjectId | string;
  tradeId: Types.ObjectId | string;
  symbol: string;
  stopLossPrice: number;
  executedQuantity: number;
  loss: number;
  timestamp: Date;
  orderId: number;
}): Promise<void> {
  try {
    const { shouldSend, email } = await shouldSendNotification(
      data.userId,
      "onStopLossHit"
    );

    if (!shouldSend || !email) {
      console.log(`[Email] Stop loss notification disabled for user ${data.userId}`);
      return;
    }

    const client = getResendClient();

    const content = `
      <h2>⚠️ Stop Loss Triggered</h2>
      <p>Your stop loss has been triggered for ${data.symbol}. The position has been closed to limit losses.</p>

      <div class="info-grid">
        <div class="info-item">
          <div class="info-label">Symbol</div>
          <div class="info-value">${data.symbol}</div>
        </div>
        <div class="info-item">
          <div class="info-label">Stop Loss</div>
          <div class="info-value"><span class="badge badge-danger">SL</span></div>
        </div>
        <div class="info-item">
          <div class="info-label">Stop Price</div>
          <div class="info-value">$${data.stopLossPrice.toFixed(6)}</div>
        </div>
        <div class="info-item">
          <div class="info-label">Executed Quantity</div>
          <div class="info-value">${data.executedQuantity.toFixed(6)}</div>
        </div>
        <div class="info-item">
          <div class="info-label">Realized Loss</div>
          <div class="info-value text-danger">-$${Math.abs(data.loss).toFixed(2)}</div>
        </div>
        <div class="info-item">
          <div class="info-label">Status</div>
          <div class="info-value"><span class="badge badge-danger">CLOSED</span></div>
        </div>
      </div>

      <p class="text-muted">Triggered at: ${data.timestamp.toLocaleString()}</p>
      <p class="text-muted">Order ID: #${data.orderId}</p>

      <hr class="divider">
      <p style="color: #6b7280; font-size: 14px;">
        ℹ️ Stop losses are essential for risk management. Consider reviewing your entry strategy.
      </p>

      <a href="${env.NEXT_PUBLIC_API_URL}/trades" class="btn">View Trade Details</a>
    `;

    await retryWithBackoff(async () => {
      const { error } = await client.emails.send({
        from: "CartelBot <noreply@cartelbot.coinspree.cc>",
        to: email,
        subject: `⚠️ Stop Loss Triggered: ${data.symbol}`,
        html: createEmailTemplate(content),
      });

      if (error) {
        throw new Error(`Failed to send email: ${error.message}`);
      }

      console.log(`[Email] Stop loss notification sent to ${email}`);
    });
  } catch (error) {
    console.error("[Email] Error sending stop loss notification:", error);
  }
}

/**
 * Send Daily Summary Email
 */
export async function sendDailySummaryNotification(data: {
  userId: Types.ObjectId | string;
  date: Date;
  tradesOpened: number;
  tradesClosed: number;
  targetsHit: number;
  stopLossesHit: number;
  totalPnL: number;
  winRate: number;
  trades: Array<{
    symbol: string;
    pnl: number;
    closeReason?: string;
  }>;
}): Promise<void> {
  try {
    const { shouldSend, email } = await shouldSendNotification(data.userId, "dailySummary");

    if (!shouldSend || !email) {
      console.log(`[Email] Daily summary disabled for user ${data.userId}`);
      return;
    }

    const client = getResendClient();

    const tradesHtml = data.trades
      .map(
        (trade) => `
        <tr style="border-bottom: 1px solid #e5e7eb;">
          <td style="padding: 12px;">${trade.symbol}</td>
          <td style="padding: 12px; text-align: right; ${
            trade.pnl >= 0 ? "color: #059669;" : "color: #dc2626;"
          }">
            ${trade.pnl >= 0 ? "+" : ""}$${trade.pnl.toFixed(2)}
          </td>
          <td style="padding: 12px; text-align: center;">
            ${
              trade.closeReason === "target"
                ? '<span class="badge badge-success">Target</span>'
                : trade.closeReason === "stop_loss"
                ? '<span class="badge badge-danger">Stop Loss</span>'
                : '<span class="badge badge-info">Open</span>'
            }
          </td>
        </tr>
      `
      )
      .join("");

    const content = `
      <h2>📊 Daily Trading Summary</h2>
      <p>Here's your trading performance for ${data.date.toLocaleDateString()}.</p>

      <div class="info-grid">
        <div class="info-item">
          <div class="info-label">Trades Opened</div>
          <div class="info-value">${data.tradesOpened}</div>
        </div>
        <div class="info-item">
          <div class="info-label">Trades Closed</div>
          <div class="info-value">${data.tradesClosed}</div>
        </div>
        <div class="info-item">
          <div class="info-label">Targets Hit</div>
          <div class="info-value text-success">${data.targetsHit}</div>
        </div>
        <div class="info-item">
          <div class="info-label">Stop Losses</div>
          <div class="info-value text-danger">${data.stopLossesHit}</div>
        </div>
        <div class="info-item">
          <div class="info-label">Total P&L</div>
          <div class="info-value ${data.totalPnL >= 0 ? "text-success" : "text-danger"}">
            ${data.totalPnL >= 0 ? "+" : ""}$${data.totalPnL.toFixed(2)}
          </div>
        </div>
        <div class="info-item">
          <div class="info-label">Win Rate</div>
          <div class="info-value">${data.winRate.toFixed(1)}%</div>
        </div>
      </div>

      ${
        data.trades.length > 0
          ? `
        <hr class="divider">
        <h3 style="color: #1f2937; margin-bottom: 15px;">Trade Details</h3>
        <table style="width: 100%; border-collapse: collapse; background: #f9fafb; border-radius: 6px; overflow: hidden;">
          <thead>
            <tr style="background: #f3f4f6;">
              <th style="padding: 12px; text-align: left; font-size: 12px; color: #6b7280;">Symbol</th>
              <th style="padding: 12px; text-align: right; font-size: 12px; color: #6b7280;">P&L</th>
              <th style="padding: 12px; text-align: center; font-size: 12px; color: #6b7280;">Status</th>
            </tr>
          </thead>
          <tbody>
            ${tradesHtml}
          </tbody>
        </table>
      `
          : ""
      }

      <a href="${env.NEXT_PUBLIC_API_URL}/dashboard" class="btn">View Full Dashboard</a>
    `;

    await retryWithBackoff(async () => {
      const { error } = await client.emails.send({
        from: "CartelBot <noreply@cartelbot.coinspree.cc>",
        to: email,
        subject: `📊 Daily Summary - ${data.date.toLocaleDateString()}`,
        html: createEmailTemplate(content),
      });

      if (error) {
        throw new Error(`Failed to send email: ${error.message}`);
      }

      console.log(`[Email] Daily summary sent to ${email}`);
    });
  } catch (error) {
    console.error("[Email] Error sending daily summary:", error);
  }
}
