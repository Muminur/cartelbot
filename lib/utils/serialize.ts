/**
 * MongoDB ObjectId Serialization Utilities
 *
 * Ensures MongoDB ObjectId fields are properly converted to strings in API responses.
 * This prevents [object Object] appearing in URLs and frontend code.
 *
 * @see CLAUDE.md - "Session: SignalId URL Encoding Fix (Nov 19, 2025)"
 */

import { Document } from "mongoose";

/**
 * Recursively converts MongoDB ObjectId instances to strings
 * Handles nested objects, arrays, and populated documents
 *
 * @param obj - Object to serialize
 * @param visited - WeakSet to track visited objects (prevents circular references)
 * @param depth - Current recursion depth
 * @param maxDepth - Maximum allowed depth (prevents stack overflow)
 */
function serializeObjectIds(
  obj: unknown,
  visited = new WeakSet<object>(),
  depth = 0,
  maxDepth = 50
): unknown {
  if (obj === null || obj === undefined) {
    return obj;
  }

  // Handle primitives
  if (typeof obj === "bigint") return obj.toString();
  if (typeof obj === "symbol" || typeof obj === "function") return String(obj);
  if (typeof obj !== "object") return obj;

  // Check depth limit (prevents stack overflow)
  if (depth > maxDepth) {
    console.warn(`[Serialization] Maximum depth (${maxDepth}) exceeded, stopping recursion`);
    return "[Max Depth Exceeded]";
  }

  // Handle MongoDB ObjectId instances
  if (obj.constructor.name === "ObjectId") {
    return String(obj);
  }

  // Preserve Date objects (don't serialize them)
  if (obj instanceof Date) {
    return obj;
  }

  // Handle Error objects (extract enumerable properties + non-enumerable error fields)
  // This prevents Error objects from serializing to {} in JSON responses
  if (obj instanceof Error) {
    // SECURITY: Use whitelist approach to prevent sensitive data leakage
    // Only include safe properties that are expected in error responses
    const errorObj = obj as {
      code?: string;
      statusCode?: number;
      binanceCode?: number;
      fields?: Record<string, string>;
      failureStage?: string;
      failureReason?: string;
      tradeId?: string;
      signalId?: string;
      retryable?: boolean;
    };

    const serialized: Record<string, unknown> = {
      // Standard Error properties (non-enumerable)
      message: obj.message,
      name: obj.name,

      // Custom error properties (whitelisted for security)
      ...(errorObj.code && { code: errorObj.code }),
      ...(errorObj.statusCode && { statusCode: errorObj.statusCode }),
      ...(errorObj.binanceCode && { binanceCode: errorObj.binanceCode }),
      ...(errorObj.fields && { fields: errorObj.fields }),
      ...(errorObj.failureStage && { failureStage: errorObj.failureStage }),
      ...(errorObj.failureReason && { failureReason: errorObj.failureReason }),
      ...(errorObj.tradeId && { tradeId: errorObj.tradeId }),
      ...(errorObj.signalId && { signalId: errorObj.signalId }),
      ...(errorObj.retryable !== undefined && { retryable: errorObj.retryable }),
    };

    // Only include stack trace in development mode for security
    if (process.env.NODE_ENV === 'development') {
      serialized.stack = obj.stack;
    }

    return serialized;
  }

  // Check for circular references
  if (visited.has(obj)) {
    console.warn("[Serialization] Circular reference detected, skipping");
    return "[Circular]";
  }
  visited.add(obj);

  // Handle arrays
  if (Array.isArray(obj)) {
    return obj.map(item => serializeObjectIds(item, visited, depth + 1, maxDepth));
  }

  // Handle plain objects
  const serialized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    serialized[key] = serializeObjectIds(value, visited, depth + 1, maxDepth);
  }
  return serialized;
}

/**
 * Serializes a Mongoose document for API responses
 * Converts all ObjectId fields to strings to prevent [object Object] in URLs
 *
 * @param doc - Mongoose document or POJO
 * @returns Plain object with all ObjectIds converted to strings
 */
export function serializeDocument<T>(doc: Document | T | null): T | null {
  if (!doc) return null;

  // Convert Mongoose document to plain object
  const obj = typeof (doc as Document).toObject === "function"
    ? (doc as Document).toObject()
    : doc;

  return serializeObjectIds(obj) as T;
}

/**
 * Serializes an array of Mongoose documents for API responses
 *
 * @param docs - Array of Mongoose documents
 * @returns Array of plain objects with ObjectIds converted to strings
 */
export function serializeDocuments<T>(docs: (Document | T)[]): T[] {
  return docs.map(doc => serializeDocument(doc) as T);
}

/**
 * Serializes API response data
 * Handles single documents, arrays, and nested structures
 *
 * @param data - Response data (document, array, or plain object)
 * @returns Serialized data with all ObjectIds as strings
 */
export function serializeResponse<T>(data: unknown): T {
  return serializeObjectIds(data) as T;
}
