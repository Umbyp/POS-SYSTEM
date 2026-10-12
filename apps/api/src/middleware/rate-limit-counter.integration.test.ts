import 'dotenv/config';
import { afterAll, describe, expect, it } from 'vitest';
import { prisma } from '../config/prisma';
import { hitCounter } from './rate-limit-store';

const key = `test:hit:${Date.now()}`;

describe('hitCounter (DB-backed attempt limiter)', () => {
  afterAll(async () => {
    await prisma.rateLimitCounter.deleteMany({ where: { key: { startsWith: key } } });
    await prisma.$disconnect();
  });

  it('counts concurrent hits atomically', async () => {
    const results = await Promise.all(Array.from({ length: 10 }, () => hitCounter(key, 60_000)));
    expect(results.map((r) => r.count).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('starts a fresh window once the old one has expired', async () => {
    const k = `${key}:exp`;
    await hitCounter(k, 60_000);
    await prisma.rateLimitCounter.update({ where: { key: k }, data: { resetAt: new Date(Date.now() - 1000) } });
    expect((await hitCounter(k, 60_000)).count).toBe(1);
  });
});
