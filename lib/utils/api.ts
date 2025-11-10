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
