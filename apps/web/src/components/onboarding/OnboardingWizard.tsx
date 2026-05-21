'use client';
import { useState } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import {
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  Store as StoreIcon,
  FolderTree,
  Package,
  Grid3X3,
  Sparkles,
  Loader2,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const SUGGESTED_CATEGORIES = [
  { name: 'เครื่องดื่ม', icon: '☕' },
  { name: 'อาหาร', icon: '🍱' },
  { name: 'ของหวาน', icon: '🍰' },
  { name: 'ขนม', icon: '🥨' },
  { name: 'ผลไม้', icon: '🍎' },
  { name: 'อื่นๆ', icon: '📦' },
];

interface Props {
  open: boolean;
  onClose: () => void;
}

export function OnboardingWizard({ open, onClose }: Props) {
  const qc = useQueryClient();
  const [step, setStep] = useState(0);

  // Step 1: Store info
  const [storeForm, setStoreForm] = useState({
    name: '',
    address: '',
    phone: '',
    taxRate: '7',
    priceIncludesTax: true,
  });

  // Step 2: Categories — preselect first 3
  const [selectedCats, setSelectedCats] = useState<string[]>([
    'เครื่องดื่ม',
    'อาหาร',
    'ของหวาน',
  ]);

  // Step 3: Products
  const [products, setProducts] = useState<
    { name: string; price: string; category: string; sku: string }[]
  >([]);
  const [newProduct, setNewProduct] = useState({
    name: '',
    price: '',
    category: 'เครื่องดื่ม',
  });

  // Step 4: Tables
  const [tableCount, setTableCount] = useState('10');
  const [tableCapacity, setTableCapacity] = useState('4');

  // Get current store data
  const { data: store } = useQuery({
    queryKey: ['store-me'],
    queryFn: () => api.get('/stores/me').then((r) => r.data),
    enabled: open,
  });

  // Auto-fill store name from existing
  useState(() => {
    if (store && !storeForm.name) {
      setStoreForm((f) => ({
        ...f,
        name: store.name || '',
        address: store.address || '',
        phone: store.phone || '',
        taxRate: String(store.taxRate ?? 7),
        priceIncludesTax: store.priceIncludesTax ?? true,
      }));
    }
  });

  const finish = useMutation({
    mutationFn: async () => {
      // 1. Update store info
      await api.patch('/stores/me', {
        name: storeForm.name,
        address: storeForm.address || null,
        phone: storeForm.phone || null,
        taxRate: Number(storeForm.taxRate),
        priceIncludesTax: storeForm.priceIncludesTax,
      });

      // 2. Create categories (idempotent — check existing first)
      const existingCats = await api.get('/products/categories').then((r) => r.data);
      const catMap: Record<string, string> = {};
      for (const name of selectedCats) {
        const existing = existingCats.find((c: any) => c.name === name);
        if (existing) {
          catMap[name] = existing.id;
        } else {
          const cat = SUGGESTED_CATEGORIES.find((c) => c.name === name);
          const created = await api
            .post('/products/categories', {
              name,
              icon: cat?.icon || '📦',
              sortOrder: selectedCats.indexOf(name),
            })
            .then((r) => r.data);
          catMap[name] = created.id;
        }
      }

      // 3. Create products
      for (const p of products) {
        const catId = catMap[p.category];
        if (!catId) continue;
        try {
          await api.post('/products', {
            name: p.name,
            sku: p.sku || `SKU-${Date.now().toString().slice(-6)}-${Math.random().toString(36).slice(-3)}`,
            costPrice: 0,
            sellingPrice: Number(p.price) || 0,
            categoryId: catId,
            trackStock: false,
          });
        } catch (e) {
          console.warn('skip product', p, e);
        }
      }

      // 4. Create tables
      const count = parseInt(tableCount) || 0;
      const capacity = parseInt(tableCapacity) || 4;
      for (let i = 1; i <= count; i++) {
        try {
          await api.post('/tables', {
            number: `T${String(i).padStart(2, '0')}`,
            capacity,
          });
        } catch (e) {
          console.warn('skip table', i, e);
        }
      }
    },
    onSuccess: () => {
      toast.success('🎉 ตั้งค่าเสร็จเรียบร้อย!');
      qc.invalidateQueries();
      setStep(4);
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'มีบางอย่างผิดพลาด'),
  });

  const STEPS = [
    { icon: StoreIcon, label: 'ข้อมูลร้าน' },
    { icon: FolderTree, label: 'หมวดหมู่' },
    { icon: Package, label: 'สินค้า' },
    { icon: Grid3X3, label: 'โต๊ะ' },
    { icon: Sparkles, label: 'เสร็จ' },
  ];

  const canNext =
    step === 0 ? storeForm.name.length >= 1 :
    step === 1 ? selectedCats.length >= 1 :
    true;

  const next = () => {
    if (step < 3) {
      setStep(step + 1);
    } else if (step === 3) {
      finish.mutate();
    }
  };

  const back = () => {
    if (step > 0 && step < 4) setStep(step - 1);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto scrollbar-thin">
        {/* Stepper */}
        <div className="flex items-center justify-between mb-3">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            const active = i === step;
            const done = i < step;
            return (
              <div key={i} className="flex flex-col items-center flex-1">
                <div
                  className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors ${
                    done
                      ? 'bg-success text-white'
                      : active
                      ? 'bg-primary text-white'
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {done ? <CheckCircle2 className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
                </div>
                <div
                  className={`text-[10px] mt-1 ${
                    active ? 'text-foreground font-medium' : 'text-muted-foreground'
                  }`}
                >
                  {s.label}
                </div>
              </div>
            );
          })}
        </div>

        {/* Step 0: Store */}
        {step === 0 && (
          <div className="space-y-3">
            <h2 className="text-lg font-bold">👋 ยินดีต้อนรับสู่ POS System</h2>
            <p className="text-sm text-muted-foreground">
              ตั้งค่าร้านของคุณใน 4 ขั้นตอนง่ายๆ
            </p>
            <div>
              <Label className="mb-1.5 block">ชื่อร้าน *</Label>
              <Input
                value={storeForm.name}
                onChange={(e) => setStoreForm({ ...storeForm, name: e.target.value })}
                placeholder="My Cafe"
                autoFocus
              />
            </div>
            <div>
              <Label className="mb-1.5 block">ที่อยู่</Label>
              <Input
                value={storeForm.address}
                onChange={(e) => setStoreForm({ ...storeForm, address: e.target.value })}
                placeholder="123 ถนน..."
              />
            </div>
            <div>
              <Label className="mb-1.5 block">เบอร์โทร</Label>
              <Input
                value={storeForm.phone}
                onChange={(e) => setStoreForm({ ...storeForm, phone: e.target.value })}
                placeholder="02-xxx-xxxx"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="mb-1.5 block">VAT (%)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={storeForm.taxRate}
                  onChange={(e) => setStoreForm({ ...storeForm, taxRate: e.target.value })}
                />
              </div>
              <label className="flex items-center gap-2 mt-7">
                <input
                  type="checkbox"
                  checked={storeForm.priceIncludesTax}
                  onChange={(e) =>
                    setStoreForm({ ...storeForm, priceIncludesTax: e.target.checked })
                  }
                  className="w-4 h-4 accent-primary"
                />
                <span className="text-sm">ราคาสินค้ารวม VAT แล้ว</span>
              </label>
            </div>
          </div>
        )}

        {/* Step 1: Categories */}
        {step === 1 && (
          <div className="space-y-3">
            <h2 className="text-lg font-bold">📁 หมวดหมู่สินค้า</h2>
            <p className="text-sm text-muted-foreground">
              เลือกหมวดหมู่ที่ต้องการใช้ (เพิ่ม/แก้ภายหลังได้)
            </p>
            <div className="grid grid-cols-2 gap-2">
              {SUGGESTED_CATEGORIES.map((c) => {
                const sel = selectedCats.includes(c.name);
                return (
                  <button
                    key={c.name}
                    type="button"
                    onClick={() => {
                      setSelectedCats(
                        sel
                          ? selectedCats.filter((x) => x !== c.name)
                          : [...selectedCats, c.name]
                      );
                    }}
                    className={`p-3 rounded-xl border-2 transition-all flex items-center gap-2 text-left ${
                      sel
                        ? 'border-primary bg-primary/10'
                        : 'border-border hover:border-muted-foreground'
                    }`}
                  >
                    <span className="text-2xl">{c.icon}</span>
                    <span className="font-medium">{c.name}</span>
                    {sel && (
                      <CheckCircle2 className="w-4 h-4 text-primary ml-auto" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Step 2: Products */}
        {step === 2 && (
          <div className="space-y-3">
            <h2 className="text-lg font-bold">📦 เพิ่มสินค้า</h2>
            <p className="text-sm text-muted-foreground">
              เพิ่มสินค้าเริ่มต้น (ไม่ใส่ก็ได้ ไปเพิ่มใน /products ภายหลัง)
            </p>

            {products.length > 0 && (
              <div className="space-y-1 max-h-48 overflow-y-auto scrollbar-thin">
                {products.map((p, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 p-2 rounded-lg bg-muted/30 text-sm"
                  >
                    <span className="flex-1 truncate">{p.name}</span>
                    <span className="text-muted-foreground text-xs">
                      {p.category}
                    </span>
                    <span className="text-accent font-medium tabular-nums">
                      ฿{p.price}
                    </span>
                    <button
                      onClick={() => setProducts(products.filter((_, idx) => idx !== i))}
                      className="text-muted-foreground hover:text-danger"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="border border-border rounded-lg p-3 space-y-2">
              <Input
                value={newProduct.name}
                onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })}
                placeholder="ชื่อสินค้า (เช่น ลาเต้)"
              />
              <div className="grid grid-cols-2 gap-2">
                <Input
                  type="number"
                  value={newProduct.price}
                  onChange={(e) => setNewProduct({ ...newProduct, price: e.target.value })}
                  placeholder="ราคา"
                />
                <select
                  value={newProduct.category}
                  onChange={(e) =>
                    setNewProduct({ ...newProduct, category: e.target.value })
                  }
                  className="bg-input border border-border rounded-lg px-3 text-sm"
                >
                  {selectedCats.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="w-full"
                disabled={!newProduct.name || !newProduct.price}
                onClick={() => {
                  setProducts([
                    ...products,
                    { ...newProduct, sku: `SKU-${Date.now()}` },
                  ]);
                  setNewProduct({ name: '', price: '', category: newProduct.category });
                }}
              >
                <Plus className="w-3.5 h-3.5 mr-1" /> เพิ่มสินค้า
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground text-center">
              เพิ่มได้ {products.length} รายการ — ไปต่อหรือเว้นว่างก็ได้
            </p>
          </div>
        )}

        {/* Step 3: Tables */}
        {step === 3 && (
          <div className="space-y-3">
            <h2 className="text-lg font-bold">🪑 โต๊ะในร้าน</h2>
            <p className="text-sm text-muted-foreground">
              สร้างโต๊ะให้อัตโนมัติ (ใส่ 0 ถ้าเป็นร้าน takeaway/online)
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="mb-1.5 block">จำนวนโต๊ะ</Label>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  value={tableCount}
                  onChange={(e) => setTableCount(e.target.value)}
                />
              </div>
              <div>
                <Label className="mb-1.5 block">ที่นั่งต่อโต๊ะ</Label>
                <Input
                  type="number"
                  min="1"
                  max="20"
                  value={tableCapacity}
                  onChange={(e) => setTableCapacity(e.target.value)}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              จะสร้างโต๊ะ T01, T02, ... T{String(parseInt(tableCount) || 0).padStart(2, '0')} (ที่นั่ง {tableCapacity})
            </p>
          </div>
        )}

        {/* Step 4: Done */}
        {step === 4 && (
          <div className="text-center py-6 space-y-3">
            <div className="w-20 h-20 rounded-full bg-success/20 flex items-center justify-center mx-auto">
              <Sparkles className="w-10 h-10 text-success" />
            </div>
            <h2 className="text-xl font-bold">🎉 พร้อมเปิดร้านแล้ว!</h2>
            <p className="text-sm text-muted-foreground">
              ตั้งค่าเสร็จเรียบร้อย ไปเริ่มขายได้เลย
            </p>
            <Button size="lg" className="w-full" onClick={onClose}>
              เริ่มใช้งาน
            </Button>
            <p className="text-xs text-muted-foreground">
              💡 ไปที่ <strong>Settings</strong> ถ้าอยากตั้งค่าเพิ่ม เช่น PromptPay,
              EasySlip, LINE Notify
            </p>
          </div>
        )}

        {/* Footer buttons */}
        {step < 4 && (
          <div className="flex gap-2 pt-3 border-t border-border">
            {step > 0 && (
              <Button variant="outline" onClick={back} disabled={finish.isPending}>
                <ArrowLeft className="w-4 h-4 mr-1" /> ย้อน
              </Button>
            )}
            <Button
              className="flex-1"
              onClick={next}
              disabled={!canNext || finish.isPending}
            >
              {finish.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : step === 3 ? (
                <>เสร็จสิ้น <Sparkles className="w-4 h-4 ml-1" /></>
              ) : (
                <>ถัดไป <ArrowRight className="w-4 h-4 ml-1" /></>
              )}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
