import { describe, it, expect } from 'vitest';
import { isValidPin, PinLockout, InMemoryLockoutStore } from './pin.logic';

describe('isValidPin', () => {
  it('accepts 4-6 digits only', () => {
    expect(isValidPin('1234')).toBe(true);
    expect(isValidPin('123456')).toBe(true);
    expect(isValidPin('123')).toBe(false);
    expect(isValidPin('1234567')).toBe(false);
    expect(isValidPin('12a4')).toBe(false);
    expect(isValidPin(1234)).toBe(false);
  });
});

describe('PinLockout', () => {
  it('locks for 5 minutes after 5 failures and unlocks after', async () => {
    let t = 0;
    const l = new PinLockout(new InMemoryLockoutStore(), 5, 300_000, () => t);
    for (let i = 0; i < 4; i++) await l.recordFailure('u');
    expect(await l.lockedFor('u')).toBe(0);
    await l.recordFailure('u');
    expect(await l.lockedFor('u')).toBe(300);
    t = 299_000;
    expect(await l.lockedFor('u')).toBe(1);
    t = 300_001;
    expect(await l.lockedFor('u')).toBe(0);
  });

  it('reset clears the counter and keys are independent', async () => {
    const l = new PinLockout(new InMemoryLockoutStore(), 2, 1000, () => 0);
    await l.recordFailure('a');
    await l.reset('a');
    await l.recordFailure('a');
    expect(await l.lockedFor('a')).toBe(0);
    await l.recordFailure('b');
    await l.recordFailure('b');
    expect(await l.lockedFor('b')).toBe(1);
    expect(await l.lockedFor('a')).toBe(0);
  });
});
