import type { Store, IncrementResponse, Options } from 'express-rate-limit';
import { prisma } from '../config/prisma';

/**
 * express-rate-limit Store backed by Postgres (via Prisma), so login
 * rate-limiting survives restarts and is shared across every API instance —
 * the default in-memory store is process-local and resets on every deploy.
 *
 * `increment` reads then writes in two steps (not one atomic statement), so
 * it has a small race window under concurrent requests for the same key.
 * Acceptable here: this only guards login/register/google-login attempts,
 * not a security-critical counter — worst case a couple of extra attempts
 * slip through occasionally.
 */
export class PrismaRateLimitStore implements Store {
  private windowMs = 60_000;

  init(options: Options) {
    this.windowMs = options.windowMs;
  }

  async increment(key: string): Promise<IncrementResponse> {
    const now = new Date();
    const existing = await prisma.rateLimitCounter.findUnique({ where: { key } });
    if (!existing || existing.resetAt <= now) {
      const resetAt = new Date(now.getTime() + this.windowMs);
      await prisma.rateLimitCounter.upsert({
        where: { key },
        create: { key, count: 1, resetAt },
        update: { count: 1, resetAt },
      });
      return { totalHits: 1, resetTime: resetAt };
    }
    const updated = await prisma.rateLimitCounter.update({
      where: { key },
      data: { count: { increment: 1 } },
    });
    return { totalHits: updated.count, resetTime: existing.resetAt };
  }

  async decrement(key: string): Promise<void> {
    await prisma.rateLimitCounter.updateMany({ where: { key }, data: { count: { decrement: 1 } } });
  }

  async resetKey(key: string): Promise<void> {
    await prisma.rateLimitCounter.deleteMany({ where: { key } });
  }
}

/**
 * Atomic attempt counter on the same RateLimitCounter table, for limits that
 * are keyed on something other than the client IP (e.g. a phone number).
 * One INSERT … ON CONFLICT statement, so concurrent attempts can't slip past
 * the limit through a read-then-write race (unlike PrismaRateLimitStore).
 */
export async function hitCounter(
  key: string,
  windowMs: number,
): Promise<{ count: number; resetAt: Date }> {
  const resetAt = new Date(Date.now() + windowMs);
  const rows = await prisma.$queryRaw<{ count: number; resetAt: Date }[]>`
    INSERT INTO "RateLimitCounter" ("key", "count", "resetAt")
    VALUES (${key}, 1, ${resetAt})
    ON CONFLICT ("key") DO UPDATE SET
      "count"   = CASE WHEN "RateLimitCounter"."resetAt" <= NOW() THEN 1 ELSE "RateLimitCounter"."count" + 1 END,
      "resetAt" = CASE WHEN "RateLimitCounter"."resetAt" <= NOW() THEN ${resetAt} ELSE "RateLimitCounter"."resetAt" END
    RETURNING "count", "resetAt"`;
  return { count: Number(rows[0].count), resetAt: rows[0].resetAt };
}
