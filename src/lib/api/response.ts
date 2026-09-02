import { NextResponse } from "next/server";
import type { ApiResponse, PaginationMeta } from "@/types/api";
import { ApiError } from "./errors";
import { createChildLogger } from "@/lib/logger";

const logger = createChildLogger("api");

export function successResponse<T>(data: T, meta?: PaginationMeta, status = 200): NextResponse {
  const body: ApiResponse<T> = { success: true, data, meta };
  return NextResponse.json(body, { status });
}

export function createdResponse<T>(data: T): NextResponse {
  return successResponse(data, undefined, 201);
}

export function errorResponse(error: unknown): NextResponse {
  if (error instanceof ApiError) {
    const body: ApiResponse = {
      success: false,
      error: {
        code: error.code,
        message: error.message,
        details: error.details,
      },
    };
    return NextResponse.json(body, { status: error.statusCode });
  }

  logger.error({ err: error }, "Unhandled API error");
  const body: ApiResponse = {
    success: false,
    error: {
      code: "INTERNAL_ERROR",
      message: "An unexpected error occurred",
    },
  };
  return NextResponse.json(body, { status: 500 });
}

export function paginationMeta(total: number, page: number, limit: number): PaginationMeta {
  return {
    total,
    page,
    limit,
    pages: Math.ceil(total / limit),
  };
}
