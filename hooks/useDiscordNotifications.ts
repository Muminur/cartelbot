/**
 * useDiscordNotifications Hook
 *
 * Connects to Discord signal SSE stream for real-time notifications
 * Displays toast notifications for each event type
 * Tracks recent events for display on the page
 */

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

export interface DiscordEvent {
  type: string;
  connectionId: string;
  messageId: string;
  timestamp: string;
  symbol?: string;
  message?: string;
  status?: string;
  confidence?: number;
  error?: string;
  signalId?: string;
  tradeId?: string;
  pnlPercentage?: number;
}

export interface TrackedEvent extends DiscordEvent {
  id: string; // Unique ID for React keys
  displayTimestamp: Date;
}

const MAX_TRACKED_EVENTS = 50;
const MAX_RETRIES = 5;

export function useDiscordNotifications() {
  const [isConnected, setIsConnected] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const [eventCount, setEventCount] = useState(0);
  const [recentEvents, setRecentEvents] = useState<TrackedEvent[]>([]);
  const retryCountRef = useRef(0);

  useEffect(() => {
    // Only run on client side
    if (typeof window === "undefined") return;

    // Connect to SSE stream
    const eventSource = new EventSource("/api/discord/stream");
    eventSourceRef.current = eventSource;

    // Connection opened
    eventSource.onopen = () => {
      setIsConnected(true);
      retryCountRef.current = 0; // Reset retry count on successful connection
      if (process.env.NODE_ENV !== "production") {
        console.log("[Discord Notifications] Connected to SSE stream");
      }
    };

    // Handle messages
    eventSource.onmessage = (event) => {
      try {
        const data: DiscordEvent = JSON.parse(event.data);

        // Ignore keepalive and connected events
        if (data.type === "connected") {
          return;
        }

        setEventCount((prev) => prev + 1);

        // Add to recent events (keep last MAX_TRACKED_EVENTS)
        const trackedEvent: TrackedEvent = {
          ...data,
          id: `${data.messageId}-${data.type}-${Date.now()}`,
          displayTimestamp: new Date(),
        };

        setRecentEvents((prev) => {
          // Avoid spread if at max capacity (performance optimization)
          if (prev.length >= MAX_TRACKED_EVENTS) {
            return [trackedEvent, ...prev.slice(0, MAX_TRACKED_EVENTS - 1)];
          }
          return [trackedEvent, ...prev];
        });

        // Show toast notification based on event type
        switch (data.type) {
          case "message_received":
            toast.info(data.message || "New Discord message received", {
              description: "Processing signal...",
              duration: 3000,
            });
            break;

          case "parsing":
            toast.loading(data.message || "Parsing signal...", {
              id: `parsing-${data.messageId}`,
              duration: 2000,
            });
            break;

          case "parsed":
            toast.success(data.message || `Signal parsed: ${data.symbol}`, {
              id: `parsing-${data.messageId}`, // Replace loading toast
              description: `Confidence: ${data.confidence}%`,
              duration: 4000,
            });
            break;

          case "executing":
            toast.loading(data.message || `Executing trade: ${data.symbol}`, {
              id: `executing-${data.messageId}`,
              description: "Placing orders on Binance...",
              duration: 5000,
            });
            break;

          case "completed":
            toast.success(data.message || `Trade executed: ${data.symbol}`, {
              id: `executing-${data.messageId}`, // Replace loading toast
              description: "Position opened successfully",
              duration: 5000,
              action: data.tradeId
                ? {
                    label: "View Trade",
                    onClick: () => {
                      window.location.href = `/trades?tradeId=${data.tradeId}`;
                    },
                  }
                : undefined,
            });
            break;

          case "failed":
            toast.error(data.message || "Signal processing failed", {
              id: `executing-${data.messageId}`, // Replace any existing toast
              description: data.error || "Check logs for details",
              duration: 7000,
            });
            break;

          case "target_hit":
            toast.success(`Target hit: ${data.symbol}`, {
              description: data.pnlPercentage !== undefined
                ? `Profit: ${data.pnlPercentage.toFixed(2)}%`
                : "Target reached",
              duration: 5000,
            });
            break;

          case "stop_loss":
            toast.error(`Stop loss triggered: ${data.symbol}`, {
              description: data.pnlPercentage !== undefined
                ? `Loss: ${data.pnlPercentage.toFixed(2)}%`
                : "Stop loss triggered",
              duration: 5000,
            });
            break;
        }

        if (process.env.NODE_ENV !== "production") {
          console.log("[Discord Notifications] Event received:", data.type, data);
        }
      } catch (error) {
        if (process.env.NODE_ENV !== "production") {
          console.error("[Discord Notifications] Error parsing event:", error);
        }
      }
    };

    // Handle errors
    eventSource.onerror = (error) => {
      setIsConnected(false);

      if (process.env.NODE_ENV !== "production") {
        console.error("[Discord Notifications] SSE error:", error);
      }

      // Check retry limit
      if (retryCountRef.current >= MAX_RETRIES) {
        toast.error("Failed to connect to notifications", {
          description: "Please refresh the page to reconnect",
          duration: 10000,
        });
        eventSource.close();
        return;
      }

      retryCountRef.current++;

      // EventSource will auto-reconnect - show user-friendly message
      toast.error("Disconnected from live notifications", {
        description: `Reconnecting (attempt ${retryCountRef.current}/${MAX_RETRIES})...`,
        duration: 3000,
      });
    };

    // Cleanup on unmount
    return () => {
      if (process.env.NODE_ENV !== "production") {
        console.log("[Discord Notifications] Disconnecting from SSE stream");
      }
      eventSource.close();
    };
  }, []); // Empty dependency array - only run once

  return {
    isConnected,
    eventCount,
    recentEvents,
    disconnect: () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null; // Clear reference to prevent memory leak
      }
      setIsConnected(false);
    },
    clearEvents: () => {
      setRecentEvents([]);
    },
  };
}
