import bcrypt from 'bcrypt';

export const PIN_REGEX = /^\d{4,6}$/;
export const MAX_PIN_ATTEMPTS = 5;
export const PIN_LOCK_MS = 5 * 60_000;

export function isValidPin(pin: unknown): pin is string {
  return typeof pin === 'string' && PIN_REGEX.test(pin);
}

export function hashPin(pin: string) {
  return bcrypt.hash(pin, 10);
}

/**
 * In-memory failed-attempt counter per key (userId). After MAX attempts the key
 * is locked for PIN_LOCK_MS. Resets on success. Process-local by design.
 */
export class PinLockout {
  private entries = new Map<string, { fails: number; lockedUntil: number }>();
  constructor(
    private max = MAX_PIN_ATTEMPTS,
    private lockMs = PIN_LOCK_MS,
    private now: () => number = Date.now
  ) {}

  /** Seconds remaining if locked, else 0. */
  lockedFor(key: string): number {
    const e = this.entries.get(key);
    if (!e || e.lockedUntil <= this.now()) return 0;
    return Math.ceil((e.lockedUntil - this.now()) / 1000);
  }

  recordFailure(key: string) {
    const t = this.now();
    let e = this.entries.get(key);
    if (!e || (e.lockedUntil && e.lockedUntil <= t)) e = { fails: 0, lockedUntil: 0 };
    e.fails += 1;
    if (e.fails >= this.max) e.lockedUntil = t + this.lockMs;
    this.entries.set(key, e);
  }

  reset(key: string) {
    this.entries.delete(key);
  }
}
