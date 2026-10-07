import { describe, it, expect, vi } from 'vitest';

vi.mock('../../utils/logger', () => ({ logger: { warn: () => {}, info: () => {}, error: () => {} } }));
import { buildKitchenTicket } from '../orders/escpos';

// Printable ASCII view of the ticket (Thai bytes become high bytes → '.').
const ascii = (b: Uint8Array) =>
  Array.from(b).map((c) => (c === 0x0a ? '\n' : c >= 0x20 && c < 0x7f ? String.fromCharCode(c) : '.')).join('');

describe('buildKitchenTicket (mockup 4a)', () => {
  const base = {
    stationName: 'KITCHEN', orderNumber: '20261007-1042', tableNumber: '12', orderType: 'DINE_IN',
    items: [{ name: 'Latte', quantity: 2, modifiers: ['less sweet'], notes: 'no whip' }, { name: 'Croissant', quantity: 1 }],
    round: { n: 1, m: 1 },
  };

  it('prints order no./table, ** modifiers, totals, round and a cut, without prices', () => {
    const t = ascii(buildKitchenTicket(base));
    expect(t).toContain('#1042');
    expect(t).toContain('T12');
    expect(t).toContain('2 x Latte');
    expect(t).toContain('** less sweet');
    expect(t).toContain('** no whip');
    expect(t).toMatch(/-- .* 1\/1 --/);
    expect(t).not.toMatch(/\d+\.\d{2}/);
    const b = buildKitchenTicket(base);
    expect(Array.from(b.slice(-3))).toEqual([0x1d, 0x56, 1]);
  });

  it('boxes the add-on marker', () => {
    const t = ascii(buildKitchenTicket({ ...base, isAddOn: true, round: { n: 2, m: 2 } }));
    expect(t).toContain('+--------------+');
  });
});
