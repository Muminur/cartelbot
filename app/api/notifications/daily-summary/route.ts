import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { User, Trade } from "@/lib/db/models";
import { sendDailySummaryNotification } from "@/lib/email/notifications";

/**
 * POST /api/notifications/daily-summary
 *
 * Endpoint to trigger daily summary emails for all active users.
 * This should be called by a cron job once per day (e.g., 8 AM UTC).
 *
 * For production, integrate with:
 * - Vercel Cron Jobs (https://vercel.com/docs/cron-jobs)
 * - GitHub Actions with scheduled workflows
 * - External cron service (cron-job.org, EasyCron, etc.)
 *
 * Security: Protect this endpoint with an API key or secret token
 */

export async function POST(request: NextRequest) {
  try {
    // Security check: Verify cron job authorization
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET || "dev_cron_secret_change_in_production";

    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json(
        {
          success: false,
          error: { message: "Unauthorized" },
        },
        { status: 401 }
      );
    }

    await connectDB();

    // Get all active users with daily summary enabled
    const users = await User.find({
      isActive: true,
      "emailNotifications.dailySummary": true,
    }).select("_id email");

    if (process.env.NODE_ENV !== 'production') console.log(`[Daily Summary] Processing ${users.length} users`);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const results = {
      success: 0,
      failed: 0,
      skipped: 0,
    };

    // Process each user
    for (const user of users) {
      try {
        // Get today's trades
        const tradesOpened = await Trade.countDocuments({
          userId: user._id.toString(),
          createdAt: { $gte: today, $lt: tomorrow },
        });

        const tradesClosed = await Trade.countDocuments({
          userId: user._id.toString(),
          status: "closed",
          updatedAt: { $gte: today, $lt: tomorrow },
        });

        // Skip if no activity today
        if (tradesOpened === 0 && tradesClosed === 0) {
          if (process.env.NODE_ENV !== 'production') console.log(`[Daily Summary] Skipping user ${user.email} - no activity`);
          results.skipped++;
          continue;
        }

        // Get detailed trade information
        const closedTrades = await Trade.find({
          userId: user._id.toString(),
          status: "closed",
          updatedAt: { $gte: today, $lt: tomorrow },
        }).select("symbol realizedPnL closeReason");

        const targetsHit = closedTrades.filter((t) => t.closeReason === "target").length;
        const stopLossesHit = closedTrades.filter((t) => t.closeReason === "stop_loss").length;

        const totalPnL = closedTrades.reduce((sum, t) => sum + (t.realizedPnL || 0), 0);

        const winRate =
          tradesClosed > 0 ? (targetsHit / tradesClosed) * 100 : 0;

        const tradesList = closedTrades.map((t) => ({
          symbol: t.symbol,
          pnl: t.realizedPnL || 0,
          closeReason: t.closeReason,
        }));

        // Send daily summary email
        await sendDailySummaryNotification({
          userId: user._id,
          date: today,
          tradesOpened,
          tradesClosed,
          targetsHit,
          stopLossesHit,
          totalPnL,
          winRate,
          trades: tradesList,
        });

        if (process.env.NODE_ENV !== 'production') console.log(`[Daily Summary] Sent to ${user.email}`);
        results.success++;
      } catch (error) {
        console.error(`[Daily Summary] Failed for user ${user.email}:`, error);
        results.failed++;
      }
    }

    if (process.env.NODE_ENV !== 'production') console.log(`[Daily Summary] Completed:`, results);

    return NextResponse.json({
      success: true,
      data: {
        message: "Daily summaries processed",
        stats: results,
      },
    });
  } catch (error) {
    console.error("[Daily Summary] Error:", error);

    return NextResponse.json(
      {
        success: false,
        error: {
          message: error instanceof Error ? error.message : "Failed to process daily summaries",
        },
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/notifications/daily-summary
 *
 * Test endpoint to check cron job status
 */
export async function GET(request: NextRequest) {
  try {
    await connectDB();

    const usersWithDailySummary = await User.countDocuments({
      isActive: true,
      "emailNotifications.dailySummary": true,
    });

    return NextResponse.json({
      success: true,
      data: {
        message: "Daily summary endpoint is ready",
        usersWithDailySummary,
        instructions: {
          trigger: "POST /api/notifications/daily-summary",
          authorization: "Bearer <CRON_SECRET>",
          schedule: "Run once per day (recommended: 8 AM UTC)",
          implementations: [
            "Vercel Cron Jobs: https://vercel.com/docs/cron-jobs",
            "GitHub Actions: .github/workflows/daily-summary.yml",
            "External: cron-job.org, EasyCron, etc.",
          ],
        },
      },
    });
  } catch (error) {
    console.error("[Daily Summary] Error:", error);

    return NextResponse.json(
      {
        success: false,
        error: {
          message: error instanceof Error ? error.message : "Failed to check status",
        },
      },
      { status: 500 }
    );
  }
}
