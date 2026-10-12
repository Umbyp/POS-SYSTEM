import { describe, it, expect } from 'vitest';
import { resolveVariants, type GroupDef } from './options';

const groups: GroupDef[] = [
  {
    id: 'g-sweet', name: 'ความหวาน', minSelect: 1, maxSelect: 1,
    options: [
      { id: 'o-0', name: 'ไม่หวาน', priceDelta: 0, isDefault: false },
      { id: 'o-50', name: 'หวานน้อย', priceDelta: 0, isDefault: true },
    ],
  },
  {
    id: 'g-top', name: 'ท็อปปิ้ง', minSelect: 0, maxSelect: 2,
    options: [
      { id: 'o-pearl', name: 'ไข่มุก', priceDelta: 10, isDefault: false },
      { id: 'o-jelly', name: 'เจลลี่', priceDelta: 8, isDefault: false },
      { id: 'o-cream', name: 'ครีมชีส', priceDelta: 15, isDefault: false },
    ],
  },
];

const fail = (fn: () => unknown, code: string) => {
  try { fn(); } catch (e: any) { expect(e.code).toBe(code); return; }
  throw new Error(`expected ${code}`);
};

describe('self-order resolveVariants', () => {
  it('prices from the server and keeps the staff-POS shape', () => {
    const v = resolveVariants('ชานม', groups, [{ name: 'หวานน้อย' }, { name: 'ไข่มุก', priceDelta: 10 }]);
    expect(v).toEqual([{ name: 'ความหวาน: หวานน้อย', priceDelta: 0 }, { name: 'ท็อปปิ้ง: ไข่มุก', priceDelta: 10 }]);
  });

  it('rejects a missing required group', () => {
    fail(() => resolveVariants('ชานม', groups, [{ name: 'ไข่มุก' }]), 'OPTION_REQUIRED');
    fail(() => resolveVariants('ชานม', groups, undefined), 'OPTION_REQUIRED');
  });

  it('rejects too many selections in a group', () => {
    fail(() => resolveVariants('ชานม', groups, [{ name: 'ไม่หวาน' }, { name: 'หวานน้อย' }]), 'OPTION_TOO_MANY');
    fail(() => resolveVariants('ชานม', groups, [
      { name: 'หวานน้อย' }, { name: 'ไข่มุก' }, { name: 'เจลลี่' }, { name: 'ครีมชีส' },
    ]), 'OPTION_TOO_MANY');
  });

  it('rejects an unknown option (and ones from another product)', () => {
    fail(() => resolveVariants('ชานม', groups, [{ name: 'หวานน้อย' }, { name: 'ทองคำ' }]), 'UNKNOWN_OPTION');
    fail(() => resolveVariants('ชานม', groups, [{ name: 'หวานน้อย', optionId: 'nope' }]), 'UNKNOWN_OPTION');
  });

  it('rejects client price tampering instead of honouring it', () => {
    fail(() => resolveVariants('ชานม', groups, [{ name: 'หวานน้อย' }, { name: 'ไข่มุก', priceDelta: 0 }]), 'PRICE_CHANGED');
    fail(() => resolveVariants('ชานม', groups, [{ name: 'หวานน้อย' }, { name: 'ไข่มุก', priceDelta: -10 }]), 'PRICE_CHANGED');
  });

  it('rejects picking the same option twice', () => {
    fail(() => resolveVariants('ชานม', groups, [{ name: 'หวานน้อย' }, { name: 'ไข่มุก' }, { name: 'ไข่มุก' }]), 'DUPLICATE_OPTION');
  });

  it('a product with no groups accepts no picks but allows none', () => {
    expect(resolveVariants('น้ำเปล่า', [], undefined)).toEqual([]);
    fail(() => resolveVariants('น้ำเปล่า', [], [{ name: 'ไข่มุก' }]), 'UNKNOWN_OPTION');
  });

  it('disambiguates same-named options by optionId/group room', () => {
    const g: GroupDef[] = [
      { id: 'a', name: 'A', minSelect: 0, maxSelect: 1, options: [{ id: 'a1', name: 'ปกติ', priceDelta: 0, isDefault: false }] },
      { id: 'b', name: 'B', minSelect: 0, maxSelect: 1, options: [{ id: 'b1', name: 'ปกติ', priceDelta: 5, isDefault: false }] },
    ];
    const v = resolveVariants('x', g, [{ name: 'ปกติ' }, { name: 'ปกติ' }]);
    expect(v.map((x) => x.priceDelta)).toEqual([0, 5]);
    expect(resolveVariants('x', g, [{ name: 'ปกติ', optionId: 'b1' }])).toEqual([{ name: 'B: ปกติ', priceDelta: 5 }]);
  });
});
