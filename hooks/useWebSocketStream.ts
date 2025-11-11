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
}

export function useWebSocketStream(options: UseWebSocketStreamOptions = {}) {
  const { autoConnect = false, onEvent } = options;
  const [isConnected, setIsConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<WebSocketEvent | null>(null);
  const [error, setError] = useState<string | null>(null);

  const connect = useCallback(() => {
    try {
      const eventSource = new EventSource("/api/websocket/stream");

      eventSource.onopen = () => {
        setIsConnected(true);
        setError(null);
      };

      eventSource.onmessage = (event) => {
        try {
          const parsedEvent = JSON.parse(event.data) as WebSocketEvent;
          setLastEvent(parsedEvent);
          onEvent?.(parsedEvent);
        } catch (err) {
          console.error("Error parsing WebSocket event:", err);
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
  }, [onEvent]);

  useEffect(() => {
    if (autoConnect) {
      const cleanup = connect();
      return cleanup;
    }
  }, [autoConnect, connect]);

  return {
    isConnected,
    lastEvent,
    error,
    connect,
  };
}
