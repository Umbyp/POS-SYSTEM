import { describe, it, expect } from 'vitest';
import { isValidPin, PinLockout } from './pin.logic';

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
  it('locks for 5 minutes after 5 failures and unlocks after', () => {
    let t = 0;
    const l = new PinLockout(5, 300_000, () => t);
    for (let i = 0; i < 4; i++) l.recordFailure('u');
    expect(l.lockedFor('u')).toBe(0);
    l.recordFailure('u');
    expect(l.lockedFor('u')).toBe(300);
    t = 299_000;
    expect(l.lockedFor('u')).toBe(1);
    t = 300_001;
    expect(l.lockedFor('u')).toBe(0);
  });

  it('reset clears the counter and keys are independent', () => {
    const l = new PinLockout(2, 1000, () => 0);
    l.recordFailure('a');
    l.reset('a');
    l.recordFailure('a');
    expect(l.lockedFor('a')).toBe(0);
    l.recordFailure('b'); l.recordFailure('b');
    expect(l.lockedFor('b')).toBe(1);
    expect(l.lockedFor('a')).toBe(0);
  });
});
