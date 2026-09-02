import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { auth } from "@/lib/auth/options";
import { hasPermission, type Permission } from "@/modules/platform-services/types/roles";
import { auditService } from "@/modules/platform-services/services/audit.service";
import { errorResponse } from "./response";
import { ApiError, ForbiddenError, UnauthorizedError, ValidationError } from "./errors";
import { distributedRateLimit, rateLimitResponse } from "./rate-limit";
import type { UserRole } from "@/types/enums";

export interface AuthenticatedContext {
  user: {
    id: string;
    email: string;
    role: UserRole;
    businessUnitId?: string | null;
  };
}

type RouteHandler = (
  req: NextRequest,
  context: { params: Promise<Record<string, string>> }
) => Promise<NextResponse>;

type AuthenticatedHandler = (
  req: NextRequest,
  context: { params: Promise<Record<string, string>> } & AuthenticatedContext
) => Promise<NextResponse>;

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function withAuth(handler: AuthenticatedHandler): RouteHandler {
  return async (req, context) => {
    try {
      const session = await auth();
      if (!session?.user?.id) {
        throw new UnauthorizedError();
      }

      const authContext: AuthenticatedContext = {
        user: {
          id: session.user.id,
          email: session.user.email!,
          role: session.user.role as UserRole,
          businessUnitId: session.user.businessUnitId,
        },
      };

      return await handler(req, { ...context, ...authContext });
    } catch (error) {
      return errorResponse(error);
    }
  };
}

export function withPermission(permission: Permission, handler: AuthenticatedHandler): AuthenticatedHandler {
  return async (req, context) => {
    if (!hasPermission(context.user.role, permission)) {
      throw new ForbiddenError();
    }
    return handler(req, context);
  };
}

export async function validateBody<T>(req: NextRequest, schema: z.ZodType<T>): Promise<T> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new ValidationError("Invalid JSON body");
  }

  const result = schema.safeParse(body);
  if (!result.success) {
    const details = result.error.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
    }));
    throw new ValidationError("Validation failed", details);
  }

  return result.data;
}

export function createHandler(
  handler: AuthenticatedHandler,
  options?: {
    permission?: Permission;
    auditAction?: string;
    rateLimit?: { limit: number; windowMs: number };
    allowedContentTypes?: string[];
    requireCsrfHeader?: boolean;
  }
): RouteHandler {
  return withAuth(async (req, context) => {
    try {
      // CSRF protection: require application/json on mutating requests
      if (MUTATING_METHODS.has(req.method)) {
        const contentType = req.headers.get("content-type") || "";
        const allowedContentTypes = options?.allowedContentTypes || ["application/json"];
        if (
          req.method !== "DELETE" &&
          !allowedContentTypes.some((allowed) => contentType.includes(allowed))
        ) {
          return NextResponse.json(
            { error: `Unsupported Content-Type. Expected ${allowedContentTypes.join(" or ")}` },
            { status: 415 }
          );
        }
        if (options?.requireCsrfHeader && req.headers.get("x-requested-with") !== "XMLHttpRequest") {
          throw new ForbiddenError("Missing CSRF protection header");
        }
      }

      // Rate limiting
      if (options?.rateLimit) {
        const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
          || req.headers.get("x-real-ip")
          || "unknown";
        const key = `${req.method}:${req.nextUrl.pathname}:${context.user.id}:${ip}`;
        const result = await distributedRateLimit({
          key,
          limit: options.rateLimit.limit,
          windowMs: options.rateLimit.windowMs,
        });
        if (!result.allowed) {
          return rateLimitResponse(result.retryAfterMs);
        }
      }

      // Permission check
      if (options?.permission && !hasPermission(context.user.role, options.permission)) {
        throw new ForbiddenError();
      }

      const response = await handler(req, context);

      // Audit log
      if (options?.auditAction && response.status < 400) {
        const params = await context.params;
        await auditService.log({
          userId: context.user.id,
          action: options.auditAction,
          entityType: undefined,
          entityId: params?.id,
          source: "API",
          ipAddress: req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || undefined,
          userAgent: req.headers.get("user-agent") || undefined,
        });
      }

      return response;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      return errorResponse(error);
    }
  });
}
