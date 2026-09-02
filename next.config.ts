import type { NextConfig } from "next";

const isProduction = process.env.NODE_ENV === "production";

/**
 * Security response headers.
 *
 * The platform is the security team's own tool and held no headers at all: no
 * framing protection, no CSP, no transport pinning. These are cheap, and their
 * absence is the kind of thing an internal AppSec review fails a build on.
 *
 * The CSP is deliberately conservative rather than aspirational. Next.js injects
 * inline bootstrap scripts and styles, so 'unsafe-inline' is required until the
 * app is migrated to nonce-based CSP; frame-ancestors, object-src and base-uri
 * still remove the attacks that matter most here.
 */
const CSP = [
  "default-src 'self'",
  // 'unsafe-inline'/'unsafe-eval' are Next.js requirements, not choices; eval is
  // dev-only (React Refresh) and dropped in production builds.
  `script-src 'self' 'unsafe-inline'${isProduction ? "" : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  // The AI provider endpoint is configurable, so connect-src cannot be pinned to
  // one host here — provider calls are made server-side and never from the page.
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  // Only in production: over plain http in development this upgrades asset
  // requests to https and breaks the local server.
  ...(isProduction ? ["upgrade-insecure-requests"] : []),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: CSP },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
  // Only meaningful over TLS, and setting it in dev would pin localhost to https.
  ...(isProduction
    ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }]
    : []),
];

const nextConfig: NextConfig = {
  output: "standalone",
  // Disable server-side logging serialization issues with Pino
  serverExternalPackages: ["pino", "pino-pretty"],
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
