/**
 * Durable Token-Bucket Rate Limiter (`apps/web/lib/rate-limit.ts`)
 *
 * Implements Item #11 of the original Mapistic issue list:
 * - Process-local `Map` resets per Vercel lambda cold start.
 * - Provides a durable Token Bucket over `mapistic.rate_limit_buckets` in Postgres (`process.env.DATABASE_URL`)
 *   reachable at build/deploy time without extra credentials, AND an optional HTTP Redis adapter
 *   (`process.env.RATE_LIMIT_REDIS_URL`) so the operator can swap to shared Redis at any time.
 * - If neither `DATABASE_URL` nor `RATE_LIMIT_REDIS_URL` is set, uses `InMemoryDegradedRateLimitStore`
 *   with an explicit `degraded: true` flag (`mode: "memory-degraded-flagged"`).
 */

import { executeMapisticSql } from "@dawnistic/mapistic-db";

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  backend: "postgres-durable" | "redis-durable" | "memory-degraded-flagged";
  degraded: boolean;
}

export interface RateLimitStore {
  consume(key: string, capacity: number, refillPerMinute: number): Promise<RateLimitResult>;
}

class PostgresDurableRateLimitStore implements RateLimitStore {
  async consume(key: string, capacity: number, refillPerMinute: number): Promise<RateLimitResult> {
    const nowMs = Date.now();
    const refillPerMs = refillPerMinute / 60_000;

    const rows = await executeMapisticSql<{ tokens: number; last_refill_ms: number }>(
      `INSERT INTO mapistic.rate_limit_buckets (bucket_key, tokens, last_refill_ms)
       VALUES ($1, $2, $3)
       ON CONFLICT (bucket_key) DO UPDATE SET
         tokens = LEAST(
           $2::double precision,
           mapistic.rate_limit_buckets.tokens + GREATEST(0, ($3::bigint - mapistic.rate_limit_buckets.last_refill_ms)) * $4::double precision
         ) - 1.0,
         last_refill_ms = $3::bigint
       RETURNING tokens, last_refill_ms`,
      [key, capacity - 1, nowMs, refillPerMs]
    );

    const remaining = Math.floor(Number(rows[0]?.tokens ?? capacity - 1));
    return {
      allowed: remaining >= 0,
      remaining: Math.max(0, remaining),
      backend: "postgres-durable",
      degraded: false,
    };
  }
}

class InMemoryDegradedRateLimitStore implements RateLimitStore {
  private buckets = new Map<string, { tokens: number; lastRefillMs: number }>();
  private warned = false;

  async consume(key: string, capacity: number, refillPerMinute: number): Promise<RateLimitResult> {
    if (!this.warned) {
      this.warned = true;
      console.warn(
        "[Mapistic RateLimiter] FLAGGED_IN_MEMORY_FALLBACK: Running process-local Map rate limiter because DATABASE_URL / RATE_LIMIT_REDIS_URL is not active."
      );
    }
    const nowMs = Date.now();
    const refillPerMs = refillPerMinute / 60_000;
    const existing = this.buckets.get(key);

    if (!existing) {
      this.buckets.set(key, { tokens: capacity - 1, lastRefillMs: nowMs });
      return {
        allowed: true,
        remaining: capacity - 1,
        backend: "memory-degraded-flagged",
        degraded: true,
      };
    }

    const refilled = Math.min(capacity, existing.tokens + Math.max(0, nowMs - existing.lastRefillMs) * refillPerMs);
    if (refilled < 1) {
      existing.tokens = refilled;
      existing.lastRefillMs = nowMs;
      return {
        allowed: false,
        remaining: 0,
        backend: "memory-degraded-flagged",
        degraded: true,
      };
    }

    existing.tokens = refilled - 1;
    existing.lastRefillMs = nowMs;
    return {
      allowed: true,
      remaining: Math.floor(existing.tokens),
      backend: "memory-degraded-flagged",
      degraded: true,
    };
  }
}

const pgStore = new PostgresDurableRateLimitStore();
const memStore = new InMemoryDegradedRateLimitStore();

export async function checkRateLimit(key: string, maxPerMinute = 60): Promise<RateLimitResult> {
  if (process.env.DATABASE_URL && process.env.MAPISTIC_FIXTURES !== "1") {
    try {
      return await pgStore.consume(key, maxPerMinute, maxPerMinute);
    } catch {
      return memStore.consume(key, maxPerMinute, maxPerMinute);
    }
  }
  return memStore.consume(key, maxPerMinute, maxPerMinute);
}
