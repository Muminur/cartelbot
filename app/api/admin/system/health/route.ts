import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/middleware/admin-auth";
import { connectDB } from "@/lib/db";
import mongoose from "mongoose";
import { WebSocketSession, Signal, Trade } from "@/lib/db/models";

export async function GET(request: Request) {
  const adminCheck = await requireAdmin(request);
  if (adminCheck.error) return adminCheck.response;

  try {
    await connectDB();

    // Database health
    const dbState = mongoose.connection.readyState;
    const dbStatus = dbState === 1 ? "connected" : dbState === 2 ? "connecting" : "disconnected";

    // WebSocket health
    const [activeWS, totalWS] = await Promise.all([
      WebSocketSession.countDocuments({ status: "active" }),
      WebSocketSession.countDocuments(),
    ]);

    // Recent activity (last 24 hours)
    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [recentSignals, recentTrades, failedSignals] = await Promise.all([
      Signal.countDocuments({ createdAt: { $gte: last24h } }),
      Trade.countDocuments({ createdAt: { $gte: last24h } }),
      Signal.countDocuments({ status: "failed", updatedAt: { $gte: last24h } }),
    ]);

    // Error rate calculation
    const totalRecentSignals = recentSignals || 1; // Prevent division by zero
    const errorRate = (failedSignals / totalRecentSignals) * 100;

    // Memory usage (Node.js process)
    const memoryUsage = process.memoryUsage();
    const memoryMB = {
      rss: Math.round(memoryUsage.rss / 1024 / 1024),
      heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024),
      heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024),
      external: Math.round(memoryUsage.external / 1024 / 1024),
    };

    // Uptime
    const uptimeSeconds = process.uptime();
    const uptimeHours = Math.floor(uptimeSeconds / 3600);
    const uptimeMinutes = Math.floor((uptimeSeconds % 3600) / 60);

    const health = {
      database: {
        status: dbStatus,
        connected: dbStatus === "connected",
        host: mongoose.connection.host || "unknown",
      },
      websocket: {
        activeConnections: activeWS,
        totalSessions: totalWS,
        healthy: activeWS >= 0,
      },
      activity: {
        signalsLast24h: recentSignals,
        tradesLast24h: recentTrades,
        failedSignalsLast24h: failedSignals,
        errorRate: errorRate.toFixed(2),
      },
      system: {
        nodeVersion: process.version,
        platform: process.platform,
        memory: memoryMB,
        uptime: `${uptimeHours}h ${uptimeMinutes}m`,
        uptimeSeconds,
      },
      timestamp: new Date().toISOString(),
    };

    return NextResponse.json({
      success: true,
      data: health,
    });
  } catch (error) {
    console.error("Error fetching system health:", error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "HEALTH_CHECK_FAILED",
          message: error instanceof Error ? error.message : "Failed to check system health",
          statusCode: 500,
        },
      },
      { status: 500 }
    );
  }
}
