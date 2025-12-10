import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth";
import { discordEventEmitter, DiscordSignalEvent } from "@/lib/discord/event-emitter";

/**
 * GET /api/discord/stream
 * Server-Sent Events stream for real-time Discord signal notifications
 *
 * Streams events:
 * - message_received: New Discord message detected
 * - parsing: Signal parsing in progress
 * - parsed: Signal parsed successfully
 * - executing: Trade execution started
 * - target_hit: Take-profit target reached
 * - stop_loss: Stop loss triggered
 * - completed: Trade fully completed
 * - failed: Processing or execution failed
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth();
    const userId = String(user._id);

    if (process.env.NODE_ENV !== "production") {
      console.log(`[Discord Stream] User ${userId} connecting to SSE stream`);
      console.log(`[Discord Stream] Current listener count for user:`, discordEventEmitter.getUserListenerCount(userId));
    }

    // Create SSE response with proper headers
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        // Send initial connection message
        const initialMessage = `data: ${JSON.stringify({
          type: "connected",
          timestamp: new Date().toISOString(),
          userId,
        })}\n\n`;
        controller.enqueue(encoder.encode(initialMessage));

        // Subscribe to Discord events for this user
        const unsubscribe = discordEventEmitter.subscribeToUserEvents(
          userId,
          (event: DiscordSignalEvent) => {
            try {
              if (process.env.NODE_ENV !== "production") {
                console.log(`[Discord Stream] 🔔 Received event for user ${userId}:`, {
                  type: event.type,
                  eventUserId: event.userId,
                  userIdMatch: event.userId === userId,
                  messageId: event.messageId,
                  symbol: event.data.symbol,
                });
              }

              // Format SSE message
              const data = JSON.stringify({
                type: event.type,
                connectionId: event.connectionId,
                messageId: event.messageId,
                timestamp: event.timestamp.toISOString(),
                ...event.data,
              });

              const message = `data: ${data}\n\n`;
              controller.enqueue(encoder.encode(message));

              if (process.env.NODE_ENV !== "production") {
                console.log(`[Discord Stream] ✅ Sent ${event.type} to user ${userId} (${data.length} bytes)`);
              }
            } catch (error) {
              if (process.env.NODE_ENV !== "production") {
                console.error(`[Discord Stream] ❌ Error encoding event:`, error);
              }
            }
          }
        );

        if (process.env.NODE_ENV !== "production") {
          console.log(`[Discord Stream] 📡 Subscribed! Listener count:`, discordEventEmitter.getUserListenerCount(userId));
        }

        // Send keepalive every 30 seconds
        const keepaliveInterval = setInterval(() => {
          try {
            controller.enqueue(encoder.encode(": keepalive\n\n"));
          } catch (error) {
            // Connection closed, cleanup
            clearInterval(keepaliveInterval);
          }
        }, 30000);

        // Cleanup on connection close
        request.signal.addEventListener("abort", () => {
          if (process.env.NODE_ENV !== "production") {
            console.log(`[Discord Stream] User ${userId} disconnected from SSE stream`);
          }
          clearInterval(keepaliveInterval);
          unsubscribe();
          try {
            controller.close();
          } catch (error) {
            // Already closed
          }
        });
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no", // Disable nginx buffering
      },
    });
  } catch (error) {
    console.error("[Discord Stream] Error creating SSE stream:", error);

    // Return error as JSON (SSE failed to initialize)
    return new Response(
      JSON.stringify({
        success: false,
        error: {
          message: "Failed to create event stream",
          code: "STREAM_ERROR",
        },
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}

// Force dynamic rendering (SSE requires streaming)
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
