import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import { User, WebSocketSession } from "@/lib/db/models";
import { decrypt } from "@/lib/encryption";
import { createBinanceClient } from "@/lib/binance/client";
import { WebSocketManager } from "@/lib/binance/websocket-manager";
import { routeEvent } from "@/lib/binance/event-handlers";
import {
  getConnection,
  setConnection,
  deleteConnection,
} from "@/lib/binance/connection-manager";

export async function POST(req: NextRequest) {
  try {
    await connectDB();
    const user = await requireAuth();
    const userId = String(user._id);

    // CRITICAL: Must explicitly select encrypted fields (schema has select: false)
    const userDoc = await User.findById(userId).select("+encryptedApiKey +encryptedApiSecret useTestnet");
    if (!userDoc?.encryptedApiKey || !userDoc?.encryptedApiSecret) {
      console.error(`[WebSocket Start] API keys not configured for user ${userId}`);
      console.error(`[WebSocket Start] encryptedApiKey: ${!!userDoc?.encryptedApiKey}, encryptedApiSecret: ${!!userDoc?.encryptedApiSecret}`);
      return NextResponse.json(
        { success: false, error: { message: "Binance API keys not configured" } },
        { status: 400 }
      );
    }

    const existingConnection = getConnection(userId);
    if (existingConnection) {
      const status = existingConnection.getConnectionStatus();
      if (status.isActive) {
        // Connection already active - return success instead of error
        return NextResponse.json({
          success: true,
          data: {
            message: "WebSocket connection already active",
            listenKey: status.listenKey || null,
          },
        });
      } else {
        // Connection exists but not active - clean it up
        await existingConnection.stop();
        deleteConnection(userId);
      }
    }

    const existingSession = await WebSocketSession.findOne({
      userId,
      isActive: true,
    });

    if (existingSession) {
      existingSession.isActive = false;
      existingSession.connectionState = "disconnected";
      await existingSession.save();
    }

    const apiKey = decrypt(userDoc.encryptedApiKey);
    const apiSecret = decrypt(userDoc.encryptedApiSecret);

    const body = await req.json().catch(() => ({}));
    // Use testnet parameter if provided, otherwise use user preference
    const testnet = body.testnet ?? userDoc.useTestnet ?? false;

    if (process.env.NODE_ENV !== 'production') console.log(`[WebSocket Start] Creating Binance client for user ${userId}, testnet: ${testnet}`);

    const binanceClient = createBinanceClient(apiKey, apiSecret, testnet);

    if (process.env.NODE_ENV !== 'production') console.log(`[WebSocket Start] Creating WebSocket manager for user ${userId}`);

    const wsManager = new WebSocketManager({
      userId,
      binanceClient,
      onEvent: async (event) => {
        await routeEvent(event);
      },
    });

    // Set up maxReconnectReached handler BEFORE starting
    // This ensures we only register it once per manager instance
    wsManager.once("maxReconnectReached", async () => {
      if (process.env.NODE_ENV !== 'production') console.log(`[WebSocket Start] Max reconnect attempts reached for user ${userId}, cleaning up connection`);
      deleteConnection(userId);
    });

    if (process.env.NODE_ENV !== 'production') console.log(`[WebSocket Start] Starting WebSocket manager for user ${userId}`);
    const listenKey = await wsManager.start();
    if (process.env.NODE_ENV !== 'production') console.log(`[WebSocket Start] WebSocket started successfully with listen key: ${listenKey?.substring(0, 10)}...`);

    setConnection(userId, wsManager);

    return NextResponse.json({
      success: true,
      data: {
        listenKey,
        message: "WebSocket connection started successfully",
      },
    });
  } catch (error) {
    console.error("[WebSocket Start] Error starting WebSocket:", error);

    // Enhanced error logging
    if (error instanceof Error) {
      console.error(`[WebSocket Start] Error name: ${error.name}`);
      console.error(`[WebSocket Start] Error message: ${error.message}`);
      console.error(`[WebSocket Start] Error stack: ${error.stack}`);
    }

    const message = error instanceof Error ? error.message : "Failed to start WebSocket";
    const statusCode = error instanceof Error && error.name === "AuthenticationError" ? 401 : 500;

    return NextResponse.json(
      {
        success: false,
        error: { message },
      },
      { status: statusCode }
    );
  }
}
