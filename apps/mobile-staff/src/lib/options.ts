import type { Product } from '@/types/pos';

export interface RenderGroup {
  key: string;
  name: string;
  minSelect: number;
  maxSelect: number; // 0 = unlimited
  options: { id: string; name: string; priceDelta: number; isDefault?: boolean }[];
}

/** Mirrors apps/web VariantPicker.buildGroups: attached store-level groups,
 *  plus legacy per-product variants as one optional multi-select group. */
export function buildGroups(product: Product | null | undefined): RenderGroup[] {
  const groups: RenderGroup[] = [];
  for (const pog of product?.optionGroups ?? []) {
    const g = pog.group;
    if (!g || g.isActive === false) continue;
    groups.push({
      key: g.id,
      name: g.name,
      minSelect: g.minSelect ?? 0,
      maxSelect: g.maxSelect ?? 1,
      options: (g.options ?? []).map((o) => ({
        id: o.id,
        name: o.name,
        priceDelta: Number(o.priceDelta),
        isDefault: o.isDefault,
      })),
    });
  }
  const legacy = product?.variants ?? [];
  if (legacy.length > 0) {
    groups.push({
      key: '_legacy',
      name: 'ตัวเลือกเพิ่มเติม',
      minSelect: 0,
      maxSelect: 0,
      options: legacy.map((v) => ({ id: v.id || v.name, name: v.name, priceDelta: Number(v.priceDelta) })),
    });
  }
  return groups;
}

export const hasOptions = (p: Product) =>
  (p.variants?.length ?? 0) > 0 || (p.optionGroups?.length ?? 0) > 0;
