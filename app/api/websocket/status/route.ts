import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import { WebSocketSession } from "@/lib/db/models";
import { getConnection } from "@/lib/binance/connection-manager";

export async function GET(_req: NextRequest) {
  try {
    await connectDB();
    const user = await requireAuth();
    const userId = String(user._id);

    const wsManager = getConnection(userId);

    const session = await WebSocketSession.findOne({
      userId,
    }).sort({ createdAt: -1 }).lean<any>();

    if (wsManager) {
      const connectionStatus = wsManager.getConnectionStatus();
      const listenerInfo = wsManager.getListenerInfo();

      return NextResponse.json({
        success: true,
        data: {
          isActive: connectionStatus.isActive,
          listenKey: connectionStatus.listenKey,
          reconnectAttempts: connectionStatus.reconnectAttempts,
          connectionState: session?.connectionState || "unknown",
          lastKeepAlive: session?.lastKeepAlive,
          errorMessage: session?.errorMessage,
          // Include listener info for debugging (only in development)
          ...(process.env.NODE_ENV === 'development' && {
            debug: {
              listeners: listenerInfo,
            },
          }),
        },
      });
    }

    if (session) {
      return NextResponse.json({
        success: true,
        data: {
          isActive: session.isActive,
          listenKey: session.listenKey,
          reconnectAttempts: 0,
          connectionState: session.connectionState,
          lastKeepAlive: session.lastKeepAlive,
          errorMessage: session.errorMessage,
        },
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        isActive: false,
        listenKey: null,
        reconnectAttempts: 0,
        connectionState: "disconnected",
        lastKeepAlive: null,
        errorMessage: null,
      },
    });
  } catch (error) {
    console.error("Error getting WebSocket status:", error);

    const message = error instanceof Error ? error.message : "Failed to get WebSocket status";
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
