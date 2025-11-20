import { NextRequest, NextResponse } from "next/server";
import { APIResponse } from "@/types";
import { formatErrorResponse, isAppError } from "./errors";
import { HTTP_STATUS } from "../constants";

export function createSuccessResponse<T>(data: T, statusCode: number = HTTP_STATUS.OK) {
  return NextResponse.json(
    {
      success: true,
      data,
    } as APIResponse<T>,
    { status: statusCode }
  );
}

export function createErrorResponse(
  error: unknown,
  statusCode: number = HTTP_STATUS.INTERNAL_SERVER_ERROR
) {
  const errorResponse = formatErrorResponse(error);

  const finalStatusCode = isAppError(error)
    ? error.statusCode
    : statusCode || HTTP_STATUS.INTERNAL_SERVER_ERROR;

  return NextResponse.json(errorResponse, { status: finalStatusCode });
}

export async function parseRequestBody<T>(request: NextRequest): Promise<T> {
  try {
    const body = await request.json();
    return body as T;
  } catch {
    throw new Error("Invalid JSON body");
  }
}

export function getQueryParam(request: NextRequest, param: string): string | null {
  return request.nextUrl.searchParams.get(param);
}

export function getQueryParams(request: NextRequest, params: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  params.forEach((param) => {
    const value = request.nextUrl.searchParams.get(param);
    if (value !== null) {
      result[param] = value;
    }
  });
  return result;
}

export function getPaginationParams(request: NextRequest) {
  const page = parseInt(getQueryParam(request, "page") || "1", 10);
  const limit = parseInt(getQueryParam(request, "limit") || "20", 10);

  return {
    page: Math.max(1, page),
    limit: Math.min(100, Math.max(1, limit)),
    skip: (Math.max(1, page) - 1) * Math.min(100, Math.max(1, limit)),
  };
}

export function validateRequiredFields<T extends Record<string, unknown>>(
  data: T,
  fields: (keyof T)[]
): string[] {
  const errors: string[] = [];

  fields.forEach((field) => {
    if (data[field] === undefined || data[field] === null || data[field] === "") {
      errors.push(`Field '${String(field)}' is required`);
    }
  });

  return errors;
}

/**
 * Safely parse JSON from a fetch Response
 *
 * This function prevents "JSON.parse: unexpected character" errors by:
 * 1. Checking if response is OK (status 200-299)
 * 2. Validating Content-Type header is JSON
 * 3. Handling empty responses
 * 4. Providing detailed error context on failure
 *
 * @param response - Fetch Response object
 * @param context - Optional context for error logging (e.g., "portfolio fetch", "ticker API")
 * @returns Parsed JSON data
 * @throws Error with detailed context if parsing fails
 */
export async function safeJsonParse<T = unknown>(
  response: Response,
  context?: string
): Promise<T> {
  const contextPrefix = context ? `[${context}] ` : '';

  // Check if response is OK (status 200-299)
  if (!response.ok) {
    const contentType = response.headers.get('content-type') || 'unknown';
    const status = response.status;
    const statusText = response.statusText;

    // Try to extract error message from response body
    let errorMessage = `HTTP ${status} ${statusText}`;

    try {
      // Only try to parse if content-type is JSON
      if (contentType.includes('application/json')) {
        const errorData = await response.json();
        errorMessage = errorData.error?.message || errorData.message || errorMessage;
      } else {
        // For HTML error pages (404, 500), read as text for debugging
        const textBody = await response.text();
        console.error(`${contextPrefix}Non-JSON response (${contentType}):`, textBody.substring(0, 200));
      }
    } catch (parseError) {
      console.error(`${contextPrefix}Failed to parse error response:`, parseError);
    }

    throw new Error(`${contextPrefix}${errorMessage}`);
  }

  // Validate Content-Type is JSON
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    const textBody = await response.text();
    console.error(`${contextPrefix}Expected JSON but got ${contentType}:`, textBody.substring(0, 200));
    throw new Error(`${contextPrefix}Server returned ${contentType} instead of JSON`);
  }

  // Clone response so we can read it multiple times if needed
  const responseClone = response.clone();

  try {
    const data = await response.json();
    return data as T;
  } catch (error) {
    // Get raw text for debugging
    const rawText = await responseClone.text();
    console.error(`${contextPrefix}JSON parse failed. Raw response:`, rawText.substring(0, 500));

    throw new Error(
      `${contextPrefix}Failed to parse JSON response: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}
