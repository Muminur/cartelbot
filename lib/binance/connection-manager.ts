import { WebSocketManager } from "./websocket-manager";

export const activeConnections = new Map<string, WebSocketManager>();

export function getConnection(userId: string): WebSocketManager | undefined {
  return activeConnections.get(userId);
}

export function setConnection(userId: string, manager: WebSocketManager): void {
  activeConnections.set(userId, manager);
}

export function deleteConnection(userId: string): boolean {
  return activeConnections.delete(userId);
}

export function hasConnection(userId: string): boolean {
  return activeConnections.has(userId);
}
