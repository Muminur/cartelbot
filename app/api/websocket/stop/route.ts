import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import { WebSocketSession } from "@/lib/db/models";
import { getConnection, deleteConnection } from "@/lib/binance/connection-manager";

export async function DELETE(_req: NextRequest) {
  try {
    await connectDB();
    const user = await requireAuth();
    const userId = String(user._id);

    const wsManager = getConnection(userId);

    if (wsManager) {
      await wsManager.stop();
      deleteConnection(userId);
    }

    await WebSocketSession.updateMany(
      { userId, isActive: true },
      {
        isActive: false,
        connectionState: "disconnected",
      }
    );

    return NextResponse.json({
      success: true,
      data: {
        message: "WebSocket connection stopped successfully",
      },
    });
  } catch (error) {
    console.error("Error stopping WebSocket:", error);

    const message = error instanceof Error ? error.message : "Failed to stop WebSocket";
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
