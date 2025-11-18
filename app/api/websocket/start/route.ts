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

    const userDoc = await User.findById(userId);
    if (!userDoc?.encryptedApiKey || !userDoc?.encryptedApiSecret) {
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

    const binanceClient = createBinanceClient(apiKey, apiSecret, testnet);

    const wsManager = new WebSocketManager({
      userId,
      binanceClient,
      onEvent: async (event) => {
        await routeEvent(event);
      },
    });

    const listenKey = await wsManager.start();

    setConnection(userId, wsManager);

    wsManager.on("maxReconnectReached", async () => {
      deleteConnection(userId);
    });

    return NextResponse.json({
      success: true,
      data: {
        listenKey,
        message: "WebSocket connection started successfully",
      },
    });
  } catch (error) {
    console.error("Error starting WebSocket:", error);

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
