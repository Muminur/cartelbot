import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import { getConnection } from "@/lib/binance/connection-manager";

// Force dynamic rendering for SSE
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    await connectDB();
    const user = await requireAuth();
    const userId = String(user._id);

    const wsManager = getConnection(userId);

    if (!wsManager) {
      return new Response(
        JSON.stringify({
          success: false,
          error: { message: "No active WebSocket connection" },
        }),
        {
          status: 404,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const encoder = new TextEncoder();
    let heartbeat: ReturnType<typeof setInterval> | null = null;
    let eventHandler: ((event: { eventType: string; eventTime: number; data: Record<string, unknown> }) => void) | null = null;

    const cleanup = () => {
      if (heartbeat) {
        clearInterval(heartbeat);
        heartbeat = null;
      }
      if (eventHandler && wsManager) {
        try {
          wsManager.off("event", eventHandler);
        } catch (e) {
          console.error("[SSE] Error removing event handler:", e);
        }
        eventHandler = null;
      }
    };

    const stream = new ReadableStream({
      start(controller) {
        eventHandler = (event: { eventType: string; eventTime: number; data: Record<string, unknown> }) => {
          try {
            const data = JSON.stringify({
              eventType: event.eventType,
              eventTime: event.eventTime,
              data: event.data,
            });
            const message = `data: ${data}\n\n`;
            controller.enqueue(encoder.encode(message));
          } catch (e) {
            // Stream may be closed, trigger cleanup
            console.error("[SSE] Error sending event:", e);
            cleanup();
          }
        };

        wsManager.on("event", eventHandler);

        heartbeat = setInterval(() => {
          try {
            controller.enqueue(encoder.encode(": heartbeat\n\n"));
          } catch (_e) {
            // Stream closed, cleanup
            cleanup();
          }
        }, 30000);

        // Handle abort signal
        req.signal.addEventListener("abort", () => {
          cleanup();
          try {
            controller.close();
          } catch (_e) {
            // Already closed
          }
        });
      },
      cancel() {
        // Called when stream is cancelled (e.g., client disconnects)
        cleanup();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
        "Content-Encoding": "none",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    console.error("Error creating SSE stream:", error);

    const message = error instanceof Error ? error.message : "Failed to create event stream";
    const statusCode = error instanceof Error && error.name === "AuthenticationError" ? 401 : 500;

    return new Response(
      JSON.stringify({
        success: false,
        error: { message },
      }),
      {
        status: statusCode,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
