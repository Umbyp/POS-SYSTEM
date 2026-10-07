import { describe, it, expect } from 'vitest';
import {
  planKitchenPrinters, planReceiptPrinters, printerAcceptsItem, deriveRound, itemsInRound,
  type RoutablePrinter,
} from './print-routing';

const p = (o: Partial<RoutablePrinter> & { id: string }): RoutablePrinter => ({
  role: 'KITCHEN', autoPrint: true, isActive: true, copies: 1, categoryIds: [], ...o,
});

describe('print routing', () => {
  it('empty categoryIds accepts every item', () => {
    expect(printerAcceptsItem({ categoryIds: [] }, { id: 'i', categoryId: 'c1' })).toBe(true);
  });

  it('category filter only takes matching items and drops stations with nothing', () => {
    const printers = [p({ id: 'kitchen', categoryIds: ['food'] }), p({ id: 'bar', categoryIds: ['drink'] })];
    const items = [
      { id: '1', categoryId: 'food' },
      { id: '2', categoryId: 'food' },
    ];
    const plan = planKitchenPrinters(printers, items);
    expect(plan.map((x) => x.printer.id)).toEqual(['kitchen']);
    expect(plan[0].items).toHaveLength(2);
  });

  it('skips inactive, non-auto and receipt printers for kitchen tickets', () => {
    const printers = [
      p({ id: 'a', isActive: false }), p({ id: 'b', autoPrint: false }),
      p({ id: 'c', role: 'RECEIPT' }), p({ id: 'd' }),
    ];
    expect(planKitchenPrinters(printers, [{ id: '1', categoryId: null }]).map((x) => x.printer.id)).toEqual(['d']);
  });

  it('receipt plan picks only active auto RECEIPT printers', () => {
    const printers = [p({ id: 'k' }), p({ id: 'r', role: 'RECEIPT' }), p({ id: 'r2', role: 'RECEIPT', autoPrint: false })];
    expect(planReceiptPrinters(printers).map((x) => x.id)).toEqual(['r']);
  });

  it('derives round number and item window from boundaries', () => {
    const r = deriveRound([100, 200], 200);
    expect(r).toMatchObject({ n: 2, m: 2, after: 100, upTo: 200 });
    const items = [
      { createdAt: new Date(90) }, { createdAt: new Date(100) },
      { createdAt: new Date(150) }, { createdAt: new Date(200) },
    ];
    expect(itemsInRound(items, r.after, r.upTo)).toHaveLength(2);
    expect(deriveRound([200], 200)).toMatchObject({ n: 1, m: 1 });
  });
});
