import { WebSocketManager } from "./websocket-manager";

export const activeConnections = new Map<string, WebSocketManager>();
const pendingConnections = new Set<string>();

export function getConnection(userId: string): WebSocketManager | undefined {
  return activeConnections.get(userId);
}

export function setConnection(userId: string, manager: WebSocketManager): void {
  activeConnections.set(userId, manager);
  pendingConnections.delete(userId);
}

export function deleteConnection(userId: string): boolean {
  pendingConnections.delete(userId);
  return activeConnections.delete(userId);
}

export function hasConnection(userId: string): boolean {
  return activeConnections.has(userId);
}

export function isPendingConnection(userId: string): boolean {
  return pendingConnections.has(userId);
}

export function setPendingConnection(userId: string): void {
  pendingConnections.add(userId);
}

export function clearPendingConnection(userId: string): void {
  pendingConnections.delete(userId);
}
