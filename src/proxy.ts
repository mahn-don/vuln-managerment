import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { hasPermission, Permission, type Role } from "@/lib/auth/permissions";

// Redirects unauthenticated users to login, and users without the right
// capability away from administrative screens.
// Note: Full auth verification still happens in API route handlers via NextAuth.
// The cookie check here only establishes that a session exists.

/**
 * Administrative sections and the capability each one needs.
 *
 * Hiding a link is not authorization: every /admin screen used to render for
 * any signed-in user, who then met an admin heading above a table that 403'd.
 * The section layouts also check this, but a layout redirect fires mid-stream
 * and can only be delivered as a client-side redirect — checking here turns it
 * into a real 307 before any of the page is rendered.
 *
 * Longest prefix first so /admin/users is matched before /admin.
 */
const ADMIN_RULES: [string, Permission][] = [
  ["/admin/users", Permission.MANAGE_USERS],
  ["/admin/audit", Permission.VIEW_AUDIT_LOGS],
  ["/admin/integrations", Permission.MANAGE_INTEGRATIONS],
  ["/admin/settings", Permission.CONFIGURE_SYSTEM],
  ["/admin/ai", Permission.CONFIGURE_SYSTEM],
  ["/admin/closure-checks", Permission.CONFIGURE_SYSTEM],
  ["/admin/sla", Permission.CONFIGURE_SLA],
  ["/admin/imports", Permission.IMPORT_EXCEL],
];

/** The hub itself is worth opening if any one of its tools is usable. */
const ADMIN_HUB_PERMISSIONS = ADMIN_RULES.map(([, permission]) => permission);

const SESSION_COOKIES = ["authjs.session-token", "__Secure-authjs.session-token"];

export async function proxy(request: NextRequest) {
  const sessionCookie =
    request.cookies.get(SESSION_COOKIES[0]) || request.cookies.get(SESSION_COOKIES[1]);

  if (!sessionCookie) {
    // An API caller must get a JSON 401, not a redirect to the login page. The
    // redirect was followed transparently by fetch(), so callers received 200
    // with an HTML body: res.ok was true, every `if (!res.ok)` guard was dead,
    // and an expired session surfaced as a JSON parse error instead of a prompt
    // to sign in again.
    if (request.nextUrl.pathname.startsWith("/api/")) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "Authentication required" } },
        { status: 401 }
      );
    }

    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", request.url);
    return NextResponse.redirect(loginUrl);
  }

  const path = request.nextUrl.pathname;
  if (path === "/admin" || path.startsWith("/admin/")) {
    const role = await roleFromRequest(request);

    // An unreadable token is not treated as a denial: the section layout still
    // checks, so a decoding problem degrades to the previous behaviour rather
    // than locking administrators out of their own console.
    if (role !== undefined) {
      const rule = ADMIN_RULES.find(([prefix]) => path === prefix || path.startsWith(`${prefix}/`));
      const permitted = rule
        ? hasPermission(role, rule[1])
        : ADMIN_HUB_PERMISSIONS.some((permission) => hasPermission(role, permission));

      if (!permitted) {
        // /dashboard is the role router; it forwards to the right landing screen.
        return NextResponse.redirect(new URL("/dashboard", request.url));
      }
    }
  }

  return NextResponse.next();
}

/** The signed-in role, or undefined when the token cannot be read. */
async function roleFromRequest(request: NextRequest): Promise<Role | undefined> {
  const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!secret) return undefined;

  for (const salt of SESSION_COOKIES) {
    try {
      const token = await getToken({
        req: request,
        secret,
        salt,
        secureCookie: salt.startsWith("__Secure-"),
      });
      const role = token?.role;
      if (typeof role === "string") return role as Role;
    } catch {
      // Try the other cookie name, then give up quietly.
    }
  }
  return undefined;
}

export const config = {
  matcher: [
    // Protect platform + API routes, skip auth callbacks/webhooks/static
    "/((?!login|api/auth|api/v1/webhooks|_next/static|_next/image|favicon.ico|public).*)",
  ],
};
