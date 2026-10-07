/**
 * Pure loyalty math (tiers + point expiry). No DB / env imports so it can be
 * unit-tested in isolation.
 */

// ---------------------------------------------------------------- tiers ----

export interface TierLike {
  id: string;
  name: string;
  minSpent: number;
  color: string | null;
  sortOrder: number;
}

export interface TierInfo {
  current: TierLike | null;
  next: TierLike | null;
  /** Progress toward `next`; null when already at the top tier. */
  progress: { spent: number; target: number; remaining: number; pct: number } | null;
}

/** Tiers a store seeds lazily the first time they're listed. */
export const DEFAULT_TIERS = [
  { name: 'TEAM', minSpent: 0, color: '#8C6A4F', sortOrder: 0 },
  { name: 'SILVER', minSpent: 5000, color: '#94A3B8', sortOrder: 1 },
  { name: 'GOLD', minSpent: 20000, color: '#B45309', sortOrder: 2 },
];

export function sortTiers<T extends { minSpent: number; sortOrder: number }>(tiers: T[]): T[] {
  return [...tiers].sort((a, b) => a.minSpent - b.minSpent || a.sortOrder - b.sortOrder);
}

/** Tier is derived from lifetime spend: highest tier whose minSpent <= totalSpent. */
export function describeTier(totalSpent: number, tiers: TierLike[]): TierInfo {
  const sorted = sortTiers(tiers);
  if (sorted.length === 0) return { current: null, next: null, progress: null };
  const spent = Math.max(0, Number(totalSpent) || 0);
  let current = sorted[0];
  for (const t of sorted) if (t.minSpent <= spent) current = t;
  const next = sorted.find((t) => t.minSpent > spent) ?? null;
  if (!next) return { current, next: null, progress: null };
  const span = next.minSpent - current.minSpent;
  const pct = span > 0 ? Math.min(100, Math.max(0, ((spent - current.minSpent) / span) * 100)) : 0;
  return {
    current,
    next,
    progress: { spent, target: next.minSpent, remaining: next.minSpent - spent, pct: Math.round(pct) },
  };
}

/** True when `customerTier` is at or above `requiredTierId` (unknown required tier -> allow). */
export function meetsTier(
  totalSpent: number,
  tiers: TierLike[],
  requiredTierId: string | null | undefined
): boolean {
  if (!requiredTierId) return true;
  const required = tiers.find((t) => t.id === requiredTierId);
  if (!required) return true; // tier was deleted — don't lock the reward forever
  return (Number(totalSpent) || 0) >= required.minSpent;
}

// --------------------------------------------------------------- expiry ----

export interface LedgerTx {
  type: string;
  points: number;
  expiresAt: Date | null;
  createdAt: Date;
}

export interface Lot {
  remaining: number;
  expiresAt: Date | null;
}

export const EXPIRING_SOON_DAYS = 30;

/** Add whole months (clamping the day, e.g. Jan 31 + 1m = Feb 28). */
export function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, lastDay));
  return d;
}

/**
 * Rebuild which credited lots still have points left, from the point ledger
 * (stamp rows must be filtered out by the caller).
 *  1. every positive row is a lot (only EARN rows can carry expiresAt)
 *  2. non-EXPIRE debits (redeems, clawbacks, negative adjusts) consume lots FIFO
 *  3. EXPIRE debits consume lots that have an expiry, soonest-expiring first
 * Step 3 targeting expiring lots is what makes expireDuePoints idempotent.
 */
export function remainingLots(txs: LedgerTx[]): Lot[] {
  const sorted = [...txs].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const lots: Lot[] = sorted
    .filter((t) => t.points > 0)
    .map((t) => ({ remaining: t.points, expiresAt: t.type === 'EARN' ? t.expiresAt : null }));

  let debit = sorted.filter((t) => t.points < 0 && t.type !== 'EXPIRE').reduce((s, t) => s - t.points, 0);
  for (const lot of lots) {
    if (debit <= 0) break;
    const take = Math.min(lot.remaining, debit);
    lot.remaining -= take;
    debit -= take;
  }

  let expired = sorted.filter((t) => t.type === 'EXPIRE').reduce((s, t) => s - Math.min(0, t.points), 0);
  const expiring = lots
    .filter((l) => l.expiresAt)
    .sort((a, b) => a.expiresAt!.getTime() - b.expiresAt!.getTime());
  for (const lot of expiring) {
    if (expired <= 0) break;
    const take = Math.min(lot.remaining, expired);
    lot.remaining -= take;
    expired -= take;
  }

  return lots.filter((l) => l.remaining > 0);
}

/** Points that will expire within the window (never more than the balance). */
export function calcExpiringSoon(
  lots: Lot[],
  balance: number,
  now: Date,
  windowDays = EXPIRING_SOON_DAYS
): { points: number; date: Date | null } {
  const end = new Date(now.getTime() + windowDays * 86_400_000);
  const within = lots.filter((l) => l.expiresAt && l.expiresAt > now && l.expiresAt <= end);
  const sum = within.reduce((s, l) => s + l.remaining, 0);
  const points = Math.max(0, Math.min(sum, balance));
  if (points === 0) return { points: 0, date: null };
  const date = within.reduce<Date | null>(
    (min, l) => (!min || l.expiresAt! < min ? l.expiresAt : min),
    null
  );
  return { points, date };
}

/** Points whose lot has already passed its expiry and must be written off now. */
export function calcDueExpiry(lots: Lot[], balance: number, now: Date): number {
  const due = lots
    .filter((l) => l.expiresAt && l.expiresAt <= now)
    .reduce((s, l) => s + l.remaining, 0);
  return Math.max(0, Math.min(due, balance));
}

// -------------------------------------------------------------- rewards ----

export type RewardCategory = 'FREE' | 'POINTS' | 'SPECIAL';

/** Badge shown on the coupon card. */
export function rewardCategory(r: { pointsCost: number; minTier: string | null }): RewardCategory {
  if (r.pointsCost === 0) return 'FREE';
  if (r.minTier) return 'SPECIAL';
  return 'POINTS';
}

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O/1/I/L
export function generateRedemptionCode(random: () => number = Math.random, length = 6): string {
  let s = '';
  for (let i = 0; i < length; i++) s += CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length)];
  return s;
}
