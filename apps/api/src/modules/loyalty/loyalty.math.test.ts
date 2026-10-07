import { describe, it, expect } from 'vitest';
import {
  describeTier, meetsTier, remainingLots, calcExpiringSoon, calcDueExpiry,
  addMonths, rewardCategory, generateRedemptionCode, DEFAULT_TIERS, type TierLike,
} from './loyalty.math';

const tiers: TierLike[] = DEFAULT_TIERS.map((t, i) => ({ id: `t${i}`, ...t }));
const d = (s: string) => new Date(s);

describe('describeTier', () => {
  it('starts at the lowest tier with progress to the next', () => {
    const r = describeTier(1000, tiers);
    expect(r.current?.name).toBe('TEAM');
    expect(r.next?.name).toBe('SILVER');
    expect(r.progress).toMatchObject({ remaining: 4000, pct: 20 });
  });
  it('promotes exactly at the threshold and has no next at the top', () => {
    expect(describeTier(5000, tiers).current?.name).toBe('SILVER');
    const top = describeTier(99999, tiers);
    expect(top.current?.name).toBe('GOLD');
    expect(top.next).toBeNull();
    expect(top.progress).toBeNull();
  });
  it('handles no tiers', () => {
    expect(describeTier(10, []).current).toBeNull();
  });
});

describe('meetsTier', () => {
  it('compares by minSpent', () => {
    expect(meetsTier(6000, tiers, 't1')).toBe(true);
    expect(meetsTier(6000, tiers, 't2')).toBe(false);
    expect(meetsTier(0, tiers, null)).toBe(true);
  });
});

describe('addMonths', () => {
  it('clamps the day to month end', () => {
    expect(addMonths(d('2026-01-31T00:00:00'), 1).getDate()).toBe(28);
    expect(addMonths(d('2026-03-15T00:00:00'), 12).getFullYear()).toBe(2027);
  });
});

describe('expiry lots', () => {
  const now = d('2026-06-01T00:00:00');
  const earn = (points: number, created: string, exp: string | null) => ({
    type: 'EARN', points, createdAt: d(created), expiresAt: exp ? d(exp) : null,
  });

  it('FIFO: a redeem eats the oldest lot first', () => {
    const lots = remainingLots([
      earn(100, '2026-01-01', '2026-06-10'),
      earn(50, '2026-03-01', '2026-09-01'),
      { type: 'REDEEM', points: -60, createdAt: d('2026-04-01'), expiresAt: null },
    ]);
    expect(lots.map((l) => l.remaining)).toEqual([40, 50]);
    expect(calcExpiringSoon(lots, 90, now, 30).points).toBe(40);
  });

  it('expiring-soon is capped by the balance and reports the earliest date', () => {
    const lots = remainingLots([earn(100, '2026-01-01', '2026-06-20'), earn(30, '2026-02-01', '2026-06-10')]);
    const r = calcExpiringSoon(lots, 80, now, 30);
    expect(r.points).toBe(80);
    expect(r.date).toEqual(d('2026-06-10'));
  });

  it('writes off due lots once, then is idempotent after the EXPIRE row exists', () => {
    const base = [
      earn(100, '2025-01-01', '2026-05-01'), // already past
      earn(40, '2026-02-01', null),           // permanent
    ];
    const due = calcDueExpiry(remainingLots(base), 140, now);
    expect(due).toBe(100);
    const after = [...base, { type: 'EXPIRE', points: -due, createdAt: now, expiresAt: null }];
    expect(calcDueExpiry(remainingLots(after), 40, new Date(now.getTime() + 1000))).toBe(0);
  });

  it('spent points are not expired a second time', () => {
    const txs = [
      earn(100, '2025-01-01', '2026-05-01'),
      { type: 'REDEEM', points: -100, createdAt: d('2025-06-01'), expiresAt: null },
    ];
    expect(calcDueExpiry(remainingLots(txs), 0, now)).toBe(0);
  });
});

describe('rewards helpers', () => {
  it('categorises', () => {
    expect(rewardCategory({ pointsCost: 0, minTier: null })).toBe('FREE');
    expect(rewardCategory({ pointsCost: 10, minTier: 'x' })).toBe('SPECIAL');
    expect(rewardCategory({ pointsCost: 10, minTier: null })).toBe('POINTS');
  });
  it('generates unambiguous 6-char codes', () => {
    expect(generateRedemptionCode()).toMatch(/^[A-HJKMNP-Z2-9]{6}$/);
  });
});
