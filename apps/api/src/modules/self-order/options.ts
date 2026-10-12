/**
 * Server-side validation + pricing of the option/variant picks a diner makes on
 * the QR self-order page. The client only tells us WHICH options it picked; the
 * name and price delta that end up on the OrderItem always come from the
 * product's assigned option groups, never from the request.
 */
import { BadRequest } from '../../utils/errors';

export interface OptionDef { id: string; name: string; priceDelta: number; isDefault: boolean }
export interface GroupDef { id: string; name: string; minSelect: number; maxSelect: number; options: OptionDef[] }

export interface RequestedVariant {
  name: string;
  priceDelta?: number;
  optionId?: string;
  groupId?: string;
}

const money = (n: number) => Math.round(n * 100);

/**
 * Returns the variants to store on the OrderItem: [{ name, priceDelta }]
 * (same shape the staff POS writes), priced from the server's option data.
 *
 * Rules: every picked option must belong to one of the product's groups;
 * a group can't exceed maxSelect (0 = unlimited); a group below minSelect is
 * an error; the same option can't be picked twice; a client-supplied
 * priceDelta that disagrees with the server's is rejected (stale menu or
 * tampering) rather than silently honoured.
 */
export function resolveVariants(
  productName: string,
  groups: GroupDef[],
  requested: RequestedVariant[] | undefined,
): { name: string; priceDelta: number }[] {
  const picks = requested ?? [];
  const chosenCount = new Map<string, number>();
  const seen = new Set<string>();
  const out: { name: string; priceDelta: number }[] = [];

  for (const v of picks) {
    // Candidate (group, option) pairs this pick could mean.
    let candidates = groups.flatMap((g) => g.options.map((o) => ({ g, o })));
    if (v.optionId) candidates = candidates.filter((c) => c.o.id === v.optionId);
    else candidates = candidates.filter((c) => c.o.name === v.name || `${c.g.name}: ${c.o.name}` === v.name);
    if (v.groupId) candidates = candidates.filter((c) => c.g.id === v.groupId);
    if (candidates.length === 0) {
      throw BadRequest(`${productName}: ไม่พบตัวเลือก "${v.name}"`, 'UNKNOWN_OPTION');
    }
    // Same name in several groups ("ปกติ")? take the first group that still has room.
    const pick =
      candidates.find((c) => c.g.maxSelect === 0 || (chosenCount.get(c.g.id) ?? 0) < c.g.maxSelect) ?? candidates[0];

    if (seen.has(pick.o.id)) {
      throw BadRequest(`${productName}: เลือก "${pick.o.name}" ซ้ำ`, 'DUPLICATE_OPTION');
    }
    seen.add(pick.o.id);
    chosenCount.set(pick.g.id, (chosenCount.get(pick.g.id) ?? 0) + 1);

    if (v.priceDelta !== undefined && money(v.priceDelta) !== money(pick.o.priceDelta)) {
      throw BadRequest(`${productName}: ราคาตัวเลือก "${pick.o.name}" เปลี่ยนไป กรุณารีเฟรชเมนู`, 'PRICE_CHANGED');
    }
    // Stored in the staff-POS shape ('<Group>: <Option>') so tickets/receipts/chips render the same for both channels.
    out.push({ name: `${pick.g.name}: ${pick.o.name}`, priceDelta: pick.o.priceDelta });
  }

  for (const g of groups) {
    const n = chosenCount.get(g.id) ?? 0;
    if (g.minSelect > 0 && n < g.minSelect) {
      throw BadRequest(`${productName}: กรุณาเลือก "${g.name}"${g.minSelect > 1 ? ` อย่างน้อย ${g.minSelect} อย่าง` : ''}`, 'OPTION_REQUIRED');
    }
    if (g.maxSelect > 0 && n > g.maxSelect) {
      throw BadRequest(`${productName}: "${g.name}" เลือกได้สูงสุด ${g.maxSelect} อย่าง`, 'OPTION_TOO_MANY');
    }
  }
  return out;
}
