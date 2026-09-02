import { NextResponse } from "next/server";
import { redis } from "@/lib/redis/client";

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

// Cleanup expired entries every 60 seconds
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (entry.resetAt <= now) store.delete(key);
  }
}, 60_000).unref?.();

export function rateLimit(opts: {
  key: string;
  limit: number;
  windowMs: number;
}): { allowed: boolean; remaining: number; retryAfterMs: number } {
  const now = Date.now();
  const existing = store.get(opts.key);

  if (!existing || existing.resetAt <= now) {
    store.set(opts.key, { count: 1, resetAt: now + opts.windowMs });
    return { allowed: true, remaining: opts.limit - 1, retryAfterMs: 0 };
  }

  existing.count += 1;

  if (existing.count > opts.limit) {
    const retryAfterMs = existing.resetAt - now;
    return { allowed: false, remaining: 0, retryAfterMs };
  }

  return { allowed: true, remaining: opts.limit - existing.count, retryAfterMs: 0 };
}

const RATE_LIMIT_SCRIPT = `
local count = redis.call("INCR", KEYS[1])
if count == 1 then
  redis.call("PEXPIRE", KEYS[1], ARGV[1])
end
local ttl = redis.call("PTTL", KEYS[1])
return { count, ttl }
`;

export async function distributedRateLimit(opts: {
  key: string;
  limit: number;
  windowMs: number;
}): Promise<{ allowed: boolean; remaining: number; retryAfterMs: number }> {
  try {
    const result = (await redis.eval(
      RATE_LIMIT_SCRIPT,
      1,
      `rate-limit:${opts.key}`,
      String(opts.windowMs)
    )) as [number, number];
    const count = Number(result[0]);
    const retryAfterMs = Math.max(Number(result[1]), 0);
    return {
      allowed: count <= opts.limit,
      remaining: Math.max(opts.limit - count, 0),
      retryAfterMs: count > opts.limit ? retryAfterMs : 0,
    };
  } catch {
    return rateLimit(opts);
  }
}

export function rateLimitResponse(retryAfterMs: number): NextResponse {
  return NextResponse.json(
    { error: "Too many requests", retryAfter: Math.ceil(retryAfterMs / 1000) },
    {
      status: 429,
      headers: { "Retry-After": String(Math.ceil(retryAfterMs / 1000)) },
    }
  );
}
