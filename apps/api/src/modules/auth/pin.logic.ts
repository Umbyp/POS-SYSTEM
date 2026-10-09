import bcrypt from 'bcryptjs';

export const PIN_REGEX = /^\d{4,6}$/;
export const MAX_PIN_ATTEMPTS = 5;
export const PIN_LOCK_MS = 5 * 60_000;

export function isValidPin(pin: unknown): pin is string {
  return typeof pin === 'string' && PIN_REGEX.test(pin);
}

export function hashPin(pin: string) {
  return bcrypt.hash(pin, 10);
}

export interface LockoutEntry {
  fails: number;
  lockedUntil: number;
}

/** Pluggable storage for PinLockout — swap in a DB-backed store in prod, an in-memory one in tests. */
export interface LockoutStore {
  get(key: string): Promise<LockoutEntry | null>;
  set(key: string, entry: LockoutEntry): Promise<void>;
  delete(key: string): Promise<void>;
}

/** Fast, process-local store — fine for unit tests, not for prod (resets on restart, not shared across instances). */
export class InMemoryLockoutStore implements LockoutStore {
  private entries = new Map<string, LockoutEntry>();
  async get(key: string) {
    return this.entries.get(key) ?? null;
  }
  async set(key: string, entry: LockoutEntry) {
    this.entries.set(key, entry);
  }
  async delete(key: string) {
    this.entries.delete(key);
  }
}

/**
 * Failed-PIN-attempt counter per key (userId), backed by a pluggable store.
 * After `max` attempts the key is locked for `lockMs`. Resets on success.
 */
export class PinLockout {
  constructor(
    private store: LockoutStore,
    private max = MAX_PIN_ATTEMPTS,
    private lockMs = PIN_LOCK_MS,
    private now: () => number = Date.now
  ) {}

  /** Seconds remaining if locked, else 0. */
  async lockedFor(key: string): Promise<number> {
    const e = await this.store.get(key);
    if (!e || e.lockedUntil <= this.now()) return 0;
    return Math.ceil((e.lockedUntil - this.now()) / 1000);
  }

  async recordFailure(key: string) {
    const t = this.now();
    let e = await this.store.get(key);
    if (!e || (e.lockedUntil && e.lockedUntil <= t)) e = { fails: 0, lockedUntil: 0 };
    e.fails += 1;
    if (e.fails >= this.max) e.lockedUntil = t + this.lockMs;
    await this.store.set(key, e);
  }

  async reset(key: string) {
    await this.store.delete(key);
  }
}
