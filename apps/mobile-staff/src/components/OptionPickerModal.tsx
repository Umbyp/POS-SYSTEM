import { useEffect, useMemo, useState } from 'react';
import { Modal, View, Text, Pressable, ScrollView, TextInput } from 'react-native';
import { Check, Minus, Plus, X } from 'lucide-react-native';
import { formatCurrency } from '@/lib/format';
import { buildGroups, type RenderGroup } from '@/lib/options';
import type { CartVariant } from '@/stores/cart.store';
import type { Product } from '@/types/pos';

interface Props {
  product: Product | null;
  onClose: () => void;
  onConfirm: (opts: { quantity: number; variants: CartVariant[]; notes?: string }) => void;
}

/** Bottom-sheet option picker — same rules/payload as apps/web VariantPicker. */
export function OptionPickerModal({ product, onClose, onConfirm }: Props) {
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState('');
  const [selected, setSelected] = useState<Record<string, string[]>>({});
  const groups = useMemo(() => buildGroups(product), [product]);

  useEffect(() => {
    if (!product) return;
    setQuantity(1);
    setNotes('');
    const init: Record<string, string[]> = {};
    for (const g of groups) {
      const defaults = g.options.filter((o) => o.isDefault).map((o) => o.id);
      init[g.key] = g.maxSelect === 1 ? defaults.slice(0, 1) : defaults;
    }
    setSelected(init);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product?.id]);

  function toggle(g: RenderGroup, optionId: string) {
    setSelected((cur) => {
      const chosen = cur[g.key] ?? [];
      const has = chosen.includes(optionId);
      let next: string[];
      if (g.maxSelect === 1) next = has ? [] : [optionId];
      else if (has) next = chosen.filter((x) => x !== optionId);
      else if (g.maxSelect > 0 && chosen.length >= g.maxSelect) next = [...chosen.slice(1), optionId];
      else next = [...chosen, optionId];
      return { ...cur, [g.key]: next };
    });
  }

  const chosenVariants: CartVariant[] = [];
  const missing: string[] = [];
  for (const g of groups) {
    const ids = selected[g.key] ?? [];
    if (g.minSelect > 0 && ids.length < g.minSelect) missing.push(g.name);
    for (const id of ids) {
      const opt = g.options.find((o) => o.id === id);
      if (opt) chosenVariants.push({ name: `${g.name}: ${opt.name}`, priceDelta: opt.priceDelta });
    }
  }
  const unitPrice = Number(product?.sellingPrice ?? 0) + chosenVariants.reduce((s, v) => s + v.priceDelta, 0);
  const canAdd = missing.length === 0;

  return (
    <Modal visible={!!product} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable className="flex-1 justify-end bg-black/40" onPress={onClose}>
        <Pressable
          className="max-h-[85%] rounded-t-2xl bg-card dark:bg-dark-card"
          onPress={(e) => e.stopPropagation()}
        >
          <View className="flex-row items-center justify-between border-b border-border dark:border-dark-border px-4 py-3.5">
            <View className="flex-1 pr-3">
              <Text numberOfLines={1} className="text-[16px] font-bold text-foreground dark:text-dark-foreground">{product?.name}</Text>
              <Text className="text-[12px] text-muted-foreground dark:text-dark-muted-foreground">
                {formatCurrency(Number(product?.sellingPrice ?? 0))}
              </Text>
            </View>
            <Pressable onPress={onClose} hitSlop={12}>
              <X size={22} color="#9CA3AF" />
            </Pressable>
          </View>

          <ScrollView contentContainerClassName="gap-5 p-4">
            {groups.map((g) => {
              const ids = selected[g.key] ?? [];
              const hint =
                g.minSelect > 0
                  ? g.maxSelect === 1 ? 'จำเป็น · เลือก 1' : `จำเป็น · อย่างน้อย ${g.minSelect}`
                  : g.maxSelect === 1 ? 'เลือก 1' : g.maxSelect > 0 ? `เลือกได้สูงสุด ${g.maxSelect}` : 'เลือกได้หลายข้อ';
              return (
                <View key={g.key} className="gap-2">
                  <View className="flex-row items-baseline justify-between">
                    <Text className="text-[13px] font-bold text-foreground dark:text-dark-foreground">{g.name}</Text>
                    <Text
                      className={`text-[11px] ${g.minSelect > 0 && ids.length < g.minSelect ? 'font-semibold text-primary' : 'text-muted-foreground dark:text-dark-muted-foreground'}`}
                    >
                      {hint}
                    </Text>
                  </View>
                  <View className="gap-1.5">
                    {g.options.map((o) => {
                      const on = ids.includes(o.id);
                      return (
                        <Pressable
                          key={o.id}
                          onPress={() => toggle(g, o.id)}
                          className={`flex-row items-center justify-between rounded-lg border px-3 py-2.5 ${on ? 'border-primary bg-primary-50' : 'border-border bg-card dark:border-dark-border dark:bg-dark-card'}`}
                        >
                          <View className="flex-row items-center gap-2.5">
                            <View
                              className={`h-[18px] w-[18px] items-center justify-center border ${g.maxSelect === 1 ? 'rounded-full' : 'rounded'} ${on ? 'border-primary bg-primary' : 'border-border dark:border-dark-border'}`}
                            >
                              {on ? <Check size={12} color="#fff" /> : null}
                            </View>
                            <Text className="text-[13px] text-foreground dark:text-dark-foreground">{o.name}</Text>
                          </View>
                          {o.priceDelta !== 0 ? (
                            <Text className="text-[12px] text-muted-foreground dark:text-dark-muted-foreground">
                              {o.priceDelta > 0 ? '+' : '-'}{formatCurrency(Math.abs(o.priceDelta))}
                            </Text>
                          ) : null}
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              );
            })}

            <View className="gap-2">
              <Text className="text-[13px] font-bold text-foreground dark:text-dark-foreground">หมายเหตุ</Text>
              <TextInput
                value={notes}
                onChangeText={setNotes}
                placeholder="เช่น ไม่ใส่ผัก"
                placeholderTextColor="#A3A3A3"
                className="h-10 rounded-lg border border-border dark:border-dark-border px-3 text-[13px] text-foreground dark:text-dark-foreground"
              />
            </View>
          </ScrollView>

          <View className="flex-row items-center gap-3 border-t border-border dark:border-dark-border p-4">
            <View className="flex-row items-center gap-3">
              <Pressable onPress={() => setQuantity((q) => Math.max(1, q - 1))} hitSlop={8} className="h-9 w-9 items-center justify-center rounded-lg border border-border dark:border-dark-border">
                <Minus size={16} color="#707070" />
              </Pressable>
              <Text className="w-5 text-center text-[15px] font-bold text-foreground dark:text-dark-foreground">{quantity}</Text>
              <Pressable onPress={() => setQuantity((q) => q + 1)} hitSlop={8} className="h-9 w-9 items-center justify-center rounded-lg border border-border dark:border-dark-border">
                <Plus size={16} color="#707070" />
              </Pressable>
            </View>
            <Pressable
              disabled={!canAdd}
              onPress={() => {
                onConfirm({ quantity, variants: chosenVariants, notes: notes.trim() || undefined });
                onClose();
              }}
              className={`h-11 flex-1 flex-row items-center justify-between rounded-lg bg-primary px-4 ${canAdd ? '' : 'opacity-50'}`}
            >
              <Text className="text-[14px] font-semibold text-white">{canAdd ? 'เพิ่มลงออเดอร์' : `เลือก ${missing[0]}`}</Text>
              <Text className="text-[14px] font-bold text-white">{formatCurrency(unitPrice * quantity)}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
