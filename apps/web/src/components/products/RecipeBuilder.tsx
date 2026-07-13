'use client';
import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, ChefHat, Loader2, Save, Search } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { formatCurrency } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useT } from '@/lib/i18n';

interface RecipeItemInput {
  ingredientId: string;
  ingredientName?: string;
  ingredientCost?: number;
  quantity: number;
  unit?: string;
  notes?: string;
}

interface Props {
  productId: string;
  isCombo?: boolean;
  onCostUpdate?: (cost: number) => void;
}

const COMMON_UNITS = ['กรัม', 'มล.', 'ชิ้น', 'ช้อน', 'ถ้วย', 'ฝา', 'หยด', 'ใบ'];

export function RecipeBuilder({ productId, isCombo, onCostUpdate }: Props) {
  const t = useT();
  const qc = useQueryClient();
  const [items, setItems] = useState<RecipeItemInput[]>([]);
  const [search, setSearch] = useState('');
  const [dirty, setDirty] = useState(false);

  // โหลด recipe ปัจจุบัน
  const { data: recipeData, isLoading } = useQuery({
    queryKey: ['recipe', productId],
    queryFn: () => api.get(`/products/${productId}/recipe`).then((r) => r.data),
    enabled: !!productId,
  });

  // สำหรับ combo — โหลดสินค้าทั้งหมด (ที่ขายได้); สำหรับ recipe — โหลดวัตถุดิบ
  const { data: ingredients = [] } = useQuery({
    queryKey: ['ingredients-list', search, isCombo],
    queryFn: () =>
      api
        .get('/products', {
          params: { q: search || undefined, includeIngredients: 1 },
        })
        .then((r) =>
          r.data.filter((p: any) => {
            if (p.id === productId) return false;
            if (isCombo) {
              // combo รับสินค้าทั่วไป ไม่ใช่ combo ซ้อน
              return !p.isCombo;
            }
            return true;
          })
        ),
  });

  useEffect(() => {
    if (recipeData?.items) {
      setItems(
        recipeData.items.map((it: any) => ({
          ingredientId: it.ingredientId,
          ingredientName: it.ingredient?.name,
          ingredientCost: Number(it.ingredient?.costPrice || 0),
          quantity: Number(it.quantity),
          unit: it.unit || '',
          notes: it.notes || '',
        }))
      );
      setDirty(false);
    }
  }, [recipeData]);

  const save = useMutation({
    mutationFn: (payload: any) =>
      api.put(`/products/${productId}/recipe`, payload).then((r) => r.data),
    onSuccess: (data) => {
      toast.success(t('recipe.saved'));
      qc.invalidateQueries({ queryKey: ['recipe', productId] });
      qc.invalidateQueries({ queryKey: ['product', productId] });
      qc.invalidateQueries({ queryKey: ['products'] });
      onCostUpdate?.(data.computedCost ?? 0);
      setDirty(false);
    },
    onError: (e: any) => toast.error(e.response?.data?.error || t('recipe.saveFailed')),
  });

  const addIngredient = (ing: any) => {
    if (items.some((i) => i.ingredientId === ing.id)) {
      toast.error(t('recipe.alreadyInRecipe'));
      return;
    }
    setItems([
      ...items,
      {
        ingredientId: ing.id,
        ingredientName: ing.name,
        ingredientCost: Number(ing.costPrice),
        quantity: 1,
        unit: '',
      },
    ]);
    setSearch('');
    setDirty(true);
  };

  const updateItem = (idx: number, patch: Partial<RecipeItemInput>) => {
    const next = [...items];
    next[idx] = { ...next[idx], ...patch };
    setItems(next);
    setDirty(true);
  };

  const removeItem = (idx: number) => {
    setItems(items.filter((_, i) => i !== idx));
    setDirty(true);
  };

  const computedCost = items.reduce(
    (s, it) => s + (it.ingredientCost || 0) * (it.quantity || 0),
    0
  );

  const handleSave = () => {
    save.mutate({
      items: items.map((it) => ({
        ingredientId: it.ingredientId,
        quantity: it.quantity,
        unit: it.unit || undefined,
        notes: it.notes || undefined,
      })),
    });
  };

  if (isLoading) {
    return <div className="shimmer h-32 rounded-xl" />;
  }

  return (
    <div className="border-t border-border pt-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ChefHat className="w-4 h-4 text-accent" />
          <span className="font-medium">
            {isCombo ? 'ส่วนประกอบในเซต' : 'สูตรการผลิต (BOM)'}
          </span>
          <span className="text-xs text-muted-foreground">
            {isCombo ? '— ตัดสต็อกอัตโนมัติเมื่อขาย' : '— ระบบคำนวณต้นทุนให้อัตโนมัติ'}
          </span>
        </div>
      </div>

      {/* Current recipe items */}
      {items.length === 0 ? (
        <div className="text-center py-4 text-sm text-muted-foreground bg-muted/30 rounded-lg">
          ยังไม่มีสูตร — เพิ่มวัตถุดิบด้านล่าง
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((it, idx) => {
            const lineCost = (it.ingredientCost || 0) * (it.quantity || 0);
            return (
              <div
                key={it.ingredientId}
                className="flex items-center gap-2 p-2 rounded-lg bg-muted/30 border border-border"
              >
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">{it.ingredientName}</div>
                  <div className="text-[10px] text-muted-foreground">
                    ต้นทุน {formatCurrency(it.ingredientCost || 0)}/หน่วย
                  </div>
                </div>
                <Input
                  type="number"
                  step="0.001"
                  min="0"
                  value={it.quantity || ''}
                  onChange={(e) =>
                    updateItem(idx, { quantity: parseFloat(e.target.value) || 0 })
                  }
                  className="w-20 h-8 text-sm tabular-nums"
                />
                <select
                  value={it.unit || ''}
                  onChange={(e) => updateItem(idx, { unit: e.target.value })}
                  className="h-8 bg-input border border-border rounded px-2 text-xs w-20"
                >
                  <option value="">-</option>
                  {COMMON_UNITS.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
                <div className="w-20 text-right text-sm tabular-nums text-accent shrink-0">
                  {formatCurrency(lineCost)}
                </div>
                <button
                  onClick={() => removeItem(idx)}
                  className="p-1 rounded text-muted-foreground hover:text-danger"
                  type="button"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Total + save */}
      {items.length > 0 && (
        <div className="flex items-center justify-between p-3 rounded-lg bg-accent/10 border border-accent/30">
          <div>
            <div className="text-xs text-muted-foreground">ต้นทุนรวมตามสูตร</div>
            <div className="text-xl font-bold text-accent tabular-nums">
              {formatCurrency(computedCost)}
            </div>
          </div>
          <Button
            type="button"
            onClick={handleSave}
            disabled={!dirty || save.isPending}
            size="sm"
          >
            {save.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <Save className="w-4 h-4 mr-1" /> บันทึกสูตร
              </>
            )}
          </Button>
        </div>
      )}

      {/* Add ingredient */}
      <div>
        <div className="text-xs text-muted-foreground mb-1">เพิ่มวัตถุดิบ</div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('recipe.searchPlaceholder')}
            className="pl-9"
          />
        </div>
        {search && (
          <div className="mt-2 max-h-48 overflow-y-auto scrollbar-thin border border-border rounded-lg bg-card">
            {ingredients.length === 0 ? (
              <div className="p-3 text-xs text-center text-muted-foreground">
                ไม่พบวัตถุดิบ — สร้างสินค้าใหม่และ tick "ใช้เป็นวัตถุดิบ" ก่อน
              </div>
            ) : (
              ingredients.slice(0, 10).map((ing: any) => (
                <button
                  key={ing.id}
                  type="button"
                  onClick={() => addIngredient(ing)}
                  className="w-full text-left p-2 hover:bg-muted/50 border-b border-border last:border-b-0 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate flex items-center gap-1">
                        {ing.isIngredient && (
                          <span className="text-[10px] px-1 rounded bg-warning/20 text-warning">
                            วัตถุดิบ
                          </span>
                        )}
                        {ing.name}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        SKU: {ing.sku} · {formatCurrency(ing.costPrice)}/หน่วย
                      </div>
                    </div>
                    <Plus className="w-3.5 h-3.5 text-primary shrink-0 ml-2" />
                  </div>
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
