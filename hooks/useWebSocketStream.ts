"use client";

import { useEffect, useState, useCallback } from "react";

interface WebSocketEvent {
  type: string;
  data: unknown;
  timestamp: string;
}

interface UseWebSocketStreamOptions {
  autoConnect?: boolean;
  onEvent?: (event: WebSocketEvent) => void;
  onAuthenticationError?: () => void;
}

export function useWebSocketStream(options: UseWebSocketStreamOptions = {}) {
  const { autoConnect = false, onEvent, onAuthenticationError } = options;
  const [isConnected, setIsConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<WebSocketEvent | null>(null);
  const [error, setError] = useState<string | null>(null);

  const connect = useCallback(async () => {
    try {
      // Step 1: Start the WebSocket connection on the server
      const startResponse = await fetch("/api/websocket/start", {
        method: "POST",
      });

      if (!startResponse.ok) {
        // Handle 401 authentication errors specially
        if (startResponse.status === 401) {
          console.warn('[WebSocketStream] Session expired - authentication required');
          setError("Authentication required");
          onAuthenticationError?.();
          return () => {};
        }

        // Handle other errors
        try {
          const { safeJsonParse } = await import('@/lib/utils/api');
          const errorData = await safeJsonParse<{ error?: any }>(startResponse, 'WebSocket Start');
          setError(errorData.error?.message || "Failed to start WebSocket connection");
        } catch (parseError) {
          // Don't log parsing errors to console - just set internal error state
          setError(`Failed to start WebSocket connection (HTTP ${startResponse.status})`);
        }
        return () => {};
      }

      // Step 2: Connect to the SSE stream
      const eventSource = new EventSource("/api/websocket/stream");

      eventSource.onopen = () => {
        setIsConnected(true);
        setError(null);
      };

      eventSource.onmessage = (event) => {
        try {
          // Validate event data is not empty
          if (!event.data || event.data.trim() === '') {
            console.warn('[WebSocketStream] Received empty event data');
            return;
          }

          const parsedEvent = JSON.parse(event.data) as WebSocketEvent;
          setLastEvent(parsedEvent);
          onEvent?.(parsedEvent);
        } catch (err) {
          console.error('[WebSocketStream] Failed to parse event data:', {
            error: err instanceof Error ? err.message : String(err),
            rawData: event.data?.substring(0, 200),
          });
        }
      };

      eventSource.onerror = () => {
        setIsConnected(false);
        setError("WebSocket connection error");
        eventSource.close();
      };

      return () => {
        eventSource.close();
        setIsConnected(false);
      };
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect");
      return () => {};
    }
  }, [onEvent, onAuthenticationError]);

  useEffect(() => {
    if (autoConnect) {
      let cleanup: (() => void) | undefined;

      connect().then((cleanupFn) => {
        cleanup = cleanupFn;
      });

      return () => {
        if (cleanup) cleanup();
      };
    }
  }, [autoConnect, connect]);

  return {
    isConnected,
    lastEvent,
    error,
    connect,
  };
}
