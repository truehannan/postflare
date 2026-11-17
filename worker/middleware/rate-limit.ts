import { createMiddleware } from "hono/factory";
import { err } from "../utils/http";

interface Window {
  count: number;
  resetAt: number;
}

/**
 * Fixed-window rate limiter keyed by IP + route bucket.
 *
 * NOTE: state lives in the Worker isolate, so limits are approximate under
 * scale-out. For hard global limits this would live in a Durable Object; the
 * interface is intentionally isolated so that swap is localised here.
 */
const buckets = new Map<string, Window>();

const LIMITS: Record<string, { max: number; windowMs: number }> = {
  auth: { max: 30, windowMs: 60_000 },
  api: { max: 600, windowMs: 60_000 },
  webhook: { max: 1200, windowMs: 60_000 },
};

export function rateLimit(bucket: "auth" | "api" | "webhook" = "api") {
  const limit = LIMITS[bucket];
  return createMiddleware(async (c, next) => {
    const ip = c.req.header("cf-connecting-ip") ?? c.req.header("x-forwarded-for") ?? "unknown";
    const key = `${bucket}:${ip}`;
    const now = Date.now();
    let w = buckets.get(key);
    if (!w || w.resetAt < now) {
      w = { count: 0, resetAt: now + limit.windowMs };
      buckets.set(key, w);
    }
    w.count += 1;
    if (w.count > limit.max) {
      throw err(429, "rate_limited", "Too many requests, please slow down");
    }
    // Lazy prune: keeps the map bounded without a background timer.
    if (buckets.size > 10_000) {
      for (const [k, win] of buckets) {
        if (win.resetAt < now) buckets.delete(k);
      }
    }
    await next();
  });
}