'use client';
import { useState, useEffect } from 'react';
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
  Wand2,
} from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useT } from '@/lib/i18n';

const SUGGESTED_CATEGORIES = [
  { name: 'Drinks', icon: '☕' },
  { name: 'Food', icon: '🍱' },
  { name: 'Desserts', icon: '🍰' },
  { name: 'Snacks', icon: '🥨' },
  { name: 'Fruits', icon: '🍎' },
  { name: 'Other', icon: '📦' },
];

// Starter menus by business type — lets a brand-new store fill its whole
// menu in one tap instead of typing every item by hand. Purely a local
// pre-fill: items land in the same editable `products` list as manual
// entries, so nothing is created until the wizard actually finishes.
const MENU_TEMPLATES: {
  key: string;
  label: string;
  icon: string;
  items: { name: string; price: number; category: string }[];
}[] = [
  {
    key: 'cafe',
    label: 'ร้านกาแฟ / คาเฟ่',
    icon: '☕',
    items: [
      { name: 'อเมริกาโน่', price: 45, category: 'Drinks' },
      { name: 'ลาเต้', price: 55, category: 'Drinks' },
      { name: 'คาปูชิโน่', price: 55, category: 'Drinks' },
      { name: 'ชาไทย', price: 45, category: 'Drinks' },
      { name: 'ชาเขียวลาเต้', price: 55, category: 'Drinks' },
      { name: 'บราวนี่', price: 65, category: 'Desserts' },
      { name: 'ชีสเค้ก', price: 75, category: 'Desserts' },
    ],
  },
  {
    key: 'bubbletea',
    label: 'ชานม / เครื่องดื่มปั่น',
    icon: '🧋',
    items: [
      { name: 'ชานมไข่มุก', price: 45, category: 'Drinks' },
      { name: 'ชาเขียวไข่มุก', price: 50, category: 'Drinks' },
      { name: 'นมสดไข่มุก', price: 45, category: 'Drinks' },
      { name: 'โกโก้ปั่น', price: 55, category: 'Drinks' },
      { name: 'ชาไทยปั่น', price: 50, category: 'Drinks' },
    ],
  },
  {
    key: 'restaurant',
    label: 'ร้านอาหารตามสั่ง',
    icon: '🍱',
    items: [
      { name: 'ข้าวผัดกะเพราหมู', price: 60, category: 'Food' },
      { name: 'ข้าวผัดกะเพราไก่', price: 60, category: 'Food' },
      { name: 'ผัดไทย', price: 65, category: 'Food' },
      { name: 'ข้าวมันไก่', price: 55, category: 'Food' },
      { name: 'ต้มยำกุ้ง', price: 90, category: 'Food' },
      { name: 'น้ำเปล่า', price: 10, category: 'Drinks' },
      { name: 'โค้ก', price: 20, category: 'Drinks' },
    ],
  },
  {
    key: 'bakery',
    label: 'เบเกอรี่ / ของหวาน',
    icon: '🥐',
    items: [
      { name: 'ครัวซองต์', price: 55, category: 'Desserts' },
      { name: 'มัฟฟินช็อกโกแลต', price: 45, category: 'Desserts' },
      { name: 'ขนมปังโฮลวีท', price: 65, category: 'Desserts' },
      { name: 'อเมริกาโน่', price: 45, category: 'Drinks' },
      { name: 'ลาเต้', price: 55, category: 'Drinks' },
    ],
  },
];

interface Props {
  open: boolean;
  onClose: () => void;
}

export function OnboardingWizard({ open, onClose }: Props) {
  const t = useT();
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
    'Drinks',
    'Food',
    'Desserts',
  ]);

  // Step 3: Products
  const [products, setProducts] = useState<
    { name: string; price: string; category: string; sku: string }[]
  >([]);
  const [newProduct, setNewProduct] = useState({
    name: '',
    price: '',
    category: 'Drinks',
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

  // Pre-fill from the store record created at registration — `store` only
  // resolves after the async fetch above, so this needs to actually re-run
  // when it arrives (a useState(() => …) lazy initializer, used previously,
  // only ever runs once on mount and misses it entirely).
  useEffect(() => {
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
  }, [store]);

  const finish = useMutation({
    mutationFn: async () => {
      // 1. Update store info + mark onboarding done (stops the wizard from
      // auto-popping up again on next login)
      await api.patch('/stores/me', {
        name: storeForm.name,
        address: storeForm.address || null,
        phone: storeForm.phone || null,
        taxRate: Number(storeForm.taxRate),
        priceIncludesTax: storeForm.priceIncludesTax,
        onboardingCompletedAt: new Date().toISOString(),
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
      toast.success(t('onboarding.setupComplete'));
      qc.invalidateQueries();
      setStep(4);
    },
    onError: (e: any) => toast.error(e.response?.data?.error || t('onboarding.somethingWrong')),
  });

  // "ข้ามตอนนี้" — marks onboarding as seen without creating anything, so the
  // wizard doesn't nag on every login. The full setup is still reachable
  // anytime from Settings → ตัวช่วยตั้งค่า.
  const skip = useMutation({
    mutationFn: () => api.patch('/stores/me', { onboardingCompletedAt: new Date().toISOString() }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['store-me'] });
      onClose();
    },
  });

  // Populate the (still-editable) product list from a starter template, and
  // make sure every category it touches is selected — otherwise a template
  // item could reference a category the user deselected in the previous step.
  const applyTemplate = (templateKey: string) => {
    const tpl = MENU_TEMPLATES.find((t) => t.key === templateKey);
    if (!tpl) return;
    const neededCats = Array.from(new Set(tpl.items.map((i) => i.category)));
    setSelectedCats((cur) => Array.from(new Set([...cur, ...neededCats])));
    setProducts((cur) => [
      ...cur,
      ...tpl.items.map((i) => ({
        name: i.name,
        price: String(i.price),
        category: i.category,
        sku: `SKU-${Date.now()}-${Math.random().toString(36).slice(-4)}`,
      })),
    ]);
    toast.success(`เพิ่มเมนู ${tpl.label} แล้ว (${tpl.items.length} รายการ) — แก้ไข/ลบได้ก่อนเสร็จสิ้น`);
  };

  const STEPS = [
    { icon: StoreIcon, label: 'Store info' },
    { icon: FolderTree, label: 'Categories' },
    { icon: Package, label: 'Products' },
    { icon: Grid3X3, label: 'Tables' },
    { icon: Sparkles, label: 'Done' },
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

  // Closing any way other than finishing (backdrop click, Esc, or the
  // explicit skip link) all mean the same thing: don't ask again this run.
  const dismiss = () => {
    if (step === 4) {
      onClose();
    } else {
      skip.mutate();
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && dismiss()}>
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
            <h2 className="text-lg font-bold">{t('onboarding.welcome')}</h2>
            <p className="text-sm text-muted-foreground">
              Set up your store in 4 easy steps
            </p>
            <div>
              <Label className="mb-1.5 block">Store name *</Label>
              <Input
                value={storeForm.name}
                onChange={(e) => setStoreForm({ ...storeForm, name: e.target.value })}
                placeholder="My Cafe"
                autoFocus
              />
            </div>
            <div>
              <Label className="mb-1.5 block">Address</Label>
              <Input
                value={storeForm.address}
                onChange={(e) => setStoreForm({ ...storeForm, address: e.target.value })}
                placeholder="123 Main St..."
              />
            </div>
            <div>
              <Label className="mb-1.5 block">Phone</Label>
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
                <span className="text-sm">Prices include VAT</span>
              </label>
            </div>
          </div>
        )}

        {/* Step 1: Categories */}
        {step === 1 && (
          <div className="space-y-3">
            <h2 className="text-lg font-bold">{t('onboarding.categories')}</h2>
            <p className="text-sm text-muted-foreground">
              Select categories to use (you can add/edit them later)
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
            <h2 className="text-lg font-bold">{t('onboarding.addProducts')}</h2>
            <p className="text-sm text-muted-foreground">
              Add some starter products (optional — you can add more later in /products)
            </p>

            {/* Menu templates — one tap fills the list below, still fully editable */}
            <div>
              <div className="text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1">
                <Wand2 className="w-3.5 h-3.5" /> เริ่มเร็วด้วยเมนูสำเร็จรูป
              </div>
              <div className="grid grid-cols-2 gap-2">
                {MENU_TEMPLATES.map((tpl) => (
                  <button
                    key={tpl.key}
                    type="button"
                    onClick={() => applyTemplate(tpl.key)}
                    className="p-2.5 rounded-xl border-2 border-border hover:border-primary hover:bg-primary/5 transition-all text-left"
                  >
                    <span className="text-xl">{tpl.icon}</span>
                    <div className="text-sm font-medium mt-0.5">{tpl.label}</div>
                    <div className="text-[10px] text-muted-foreground">{tpl.items.length} เมนู</div>
                  </button>
                ))}
              </div>
            </div>

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
                placeholder="Product name (e.g. Latte)"
              />
              <div className="grid grid-cols-2 gap-2">
                <Input
                  type="number"
                  value={newProduct.price}
                  onChange={(e) => setNewProduct({ ...newProduct, price: e.target.value })}
                  placeholder="Price"
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
                <Plus className="w-3.5 h-3.5 mr-1" /> Add product
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground text-center">
              {products.length} item{products.length !== 1 ? 's' : ''} added — proceed or skip
            </p>
          </div>
        )}

        {/* Step 3: Tables */}
        {step === 3 && (
          <div className="space-y-3">
            <h2 className="text-lg font-bold">{t('onboarding.tables')}</h2>
            <p className="text-sm text-muted-foreground">
              Auto-create tables (set to 0 for takeaway/online-only stores)
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="mb-1.5 block">Number of tables</Label>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  value={tableCount}
                  onChange={(e) => setTableCount(e.target.value)}
                />
              </div>
              <div>
                <Label className="mb-1.5 block">Seats per table</Label>
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
              Will create tables T01, T02, ... T{String(parseInt(tableCount) || 0).padStart(2, '0')} ({tableCapacity} seats each)
            </p>
          </div>
        )}

        {/* Step 4: Done */}
        {step === 4 && (
          <div className="text-center py-6 space-y-3">
            <div className="w-20 h-20 rounded-full bg-success/20 flex items-center justify-center mx-auto">
              <Sparkles className="w-10 h-10 text-success" />
            </div>
            <h2 className="text-xl font-bold">{t('onboarding.readyToOpen')}</h2>
            <p className="text-sm text-muted-foreground">
              Setup complete — you can start selling now
            </p>
            <Button size="lg" className="w-full" onClick={onClose}>
              Get started
            </Button>
            <p className="text-xs text-muted-foreground">
              💡 Visit <strong>Settings</strong> for more options like PromptPay,
              EasySlip, LINE Notify
            </p>
          </div>
        )}

        {/* Footer buttons */}
        {step < 4 && (
          <div className="pt-3 border-t border-border space-y-2">
            <div className="flex gap-2">
              {step > 0 && (
                <Button variant="outline" onClick={back} disabled={finish.isPending}>
                  <ArrowLeft className="w-4 h-4 mr-1" /> Back
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
                  <>Finish <Sparkles className="w-4 h-4 ml-1" /></>
                ) : (
                  <>Next <ArrowRight className="w-4 h-4 ml-1" /></>
                )}
              </Button>
            </div>
            <button
              type="button"
              onClick={() => skip.mutate()}
              disabled={skip.isPending || finish.isPending}
              className="w-full text-center text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
            >
              ข้ามตอนนี้ — ตั้งค่าทีหลังได้ที่ ตั้งค่า → ตัวช่วยตั้งค่า
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
