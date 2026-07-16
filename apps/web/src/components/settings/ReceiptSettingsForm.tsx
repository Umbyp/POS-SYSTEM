'use client';
import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2, Save, QrCode, MessageSquare } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Receipt } from '@/components/pos/Receipt';
import { useT } from '@/lib/i18n';

// A fixed sample bill for the live preview — never sent anywhere, just fed
// straight into the real <Receipt> component so what the owner sees while
// typing is pixel-for-pixel what actually prints.
const SAMPLE_ORDER = {
  id: 'preview',
  orderNumber: 'ORD-20260101-0001',
  createdAt: new Date().toISOString(),
  type: 'TAKEAWAY',
  table: null,
  customer: null,
  cashier: { name: 'พนักงานตัวอย่าง' },
  items: [
    {
      id: '1',
      product: { name: 'ชาไทยเย็น' },
      quantity: 1,
      unitPrice: 55,
      discount: 0,
      notes: 'ใส่น้ำแข็งน้อย',
      variants: [{ name: 'ความหวาน: 50%' }, { name: 'ไซซ์: L' }],
    },
    {
      id: '2',
      product: { name: 'ชานมไข่มุก' },
      quantity: 2,
      unitPrice: 65,
      discount: 0,
      variants: [{ name: 'ความหวาน: 100%' }],
    },
  ],
  subtotal: 185,
  discount: 0,
  serviceCharge: 0,
  tax: 12.1,
  total: 185,
  pointsEarned: 0,
  pointsRedeemed: 0,
  payments: [{ id: 'p1', method: 'CASH', amount: 200 }],
};

export function ReceiptSettingsForm() {
  const t = useT();
  const qc = useQueryClient();

  const { data: store, isLoading } = useQuery({
    queryKey: ['store-me'],
    queryFn: () => api.get('/stores/me').then((r) => r.data),
  });

  const [form, setForm] = useState({
    receiptShowSignupQr: true,
    receiptSignupHeadline: '',
    receiptShowPointsQr: true,
    receiptPointsTerms: '',
    receiptFooterText: '',
  });

  useEffect(() => {
    if (store) {
      setForm({
        receiptShowSignupQr: store.receiptShowSignupQr ?? true,
        receiptSignupHeadline: store.receiptSignupHeadline || '',
        receiptShowPointsQr: store.receiptShowPointsQr ?? true,
        receiptPointsTerms: store.receiptPointsTerms || '',
        receiptFooterText: store.receiptFooterText || '',
      });
    }
  }, [store]);

  const save = useMutation({
    mutationFn: (payload: any) => api.patch('/stores/me', payload).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['store-me'] });
      toast.success('บันทึกการตั้งค่าใบเสร็จแล้ว');
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'บันทึกไม่สำเร็จ'),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    save.mutate({
      receiptShowSignupQr: form.receiptShowSignupQr,
      receiptSignupHeadline: form.receiptSignupHeadline || null,
      receiptShowPointsQr: form.receiptShowPointsQr,
      receiptPointsTerms: form.receiptPointsTerms || null,
      receiptFooterText: form.receiptFooterText || null,
    });
  };

  if (isLoading || !store) {
    return <div className="shimmer h-96 rounded-2xl" />;
  }

  const loyaltyOn = store.loyaltyMode && store.loyaltyMode !== 'OFF';
  // Merge the form's live (unsaved) values into the store object the preview
  // reads, so every keystroke reflects on the mock receipt immediately.
  const previewStore = { ...store, ...form };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-4 items-start">
      <form onSubmit={submit} className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>ปรับแต่งใบเสร็จ</CardTitle>
            <CardDescription>
              ข้อความและ QR ท้ายใบเสร็จ — ปรับได้เองที่นี่ ไม่ต้องแก้โค้ด เห็นผลทันทีในตัวอย่างด้านขวา
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!loyaltyOn && (
              <div className="text-xs text-warning bg-warning/10 border border-warning/20 rounded-lg p-2.5">
                ร้านยังไม่ได้เปิดระบบสะสมแต้ม — ตั้งค่าด้านล่างจะยังไม่แสดงบนใบเสร็จจนกว่าจะเปิดที่หน้า “สะสมแต้ม”
              </div>
            )}

            <label className="flex items-start gap-3 p-3 rounded-lg border border-border bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors">
              <input
                type="checkbox"
                checked={form.receiptShowSignupQr}
                onChange={(e) => setForm({ ...form, receiptShowSignupQr: e.target.checked })}
                className="mt-0.5 w-4 h-4 accent-primary"
              />
              <div className="flex-1">
                <div className="text-sm font-medium flex items-center gap-1.5">
                  <QrCode className="w-3.5 h-3.5" /> โชว์ QR ชวนสมัครสมาชิก
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  QR ทั่วไป ไม่ผูกกับบิลนี้ — ชวนลูกค้าใหม่สมัครสมาชิก
                </div>
              </div>
            </label>
            {form.receiptShowSignupQr && (
              <div>
                <Label className="mb-1.5 block">หัวข้อเหนือ QR สมัครสมาชิก</Label>
                <Input
                  value={form.receiptSignupHeadline}
                  onChange={(e) => setForm({ ...form, receiptSignupHeadline: e.target.value })}
                  placeholder="สมัครสมาชิก เพื่อรับสิทธิพิเศษมากมาย!"
                />
              </div>
            )}

            <label className="flex items-start gap-3 p-3 rounded-lg border border-border bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors">
              <input
                type="checkbox"
                checked={form.receiptShowPointsQr}
                onChange={(e) => setForm({ ...form, receiptShowPointsQr: e.target.checked })}
                className="mt-0.5 w-4 h-4 accent-primary"
              />
              <div className="flex-1">
                <div className="text-sm font-medium flex items-center gap-1.5">
                  <QrCode className="w-3.5 h-3.5" /> โชว์ QR สแกนสะสมแต้มจากบิลนี้
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  ขึ้นเฉพาะบิลที่ยังไม่ได้ผูกกับสมาชิก ให้ลูกค้าสแกนแล้วรับแต้มย้อนหลังได้
                </div>
              </div>
            </label>
            {form.receiptShowPointsQr && (
              <div>
                <Label className="mb-1.5 block">ข้อความเงื่อนไขใต้ QR สะสมแต้ม</Label>
                <Input
                  value={form.receiptPointsTerms}
                  onChange={(e) => setForm({ ...form, receiptPointsTerms: e.target.value })}
                  placeholder="สแกนภายใน 24 ชั่วโมงหลังทำรายการ"
                />
              </div>
            )}

            <div>
              <Label className="mb-1.5 block flex items-center gap-1.5">
                <MessageSquare className="w-3.5 h-3.5" /> ข้อความท้ายใบเสร็จ
              </Label>
              <Input
                value={form.receiptFooterText}
                onChange={(e) => setForm({ ...form, receiptFooterText: e.target.value })}
                placeholder="Thank you for your purchase"
              />
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2 sticky bottom-0 bg-background py-4">
          <Button type="submit" size="lg" disabled={save.isPending}>
            {save.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Save className="w-4 h-4 mr-1" /> {t('storeSettings.saveButton')}</>}
          </Button>
        </div>
      </form>

      {/* Live preview — same Receipt component real bills use */}
      <div className="xl:sticky xl:top-4">
        <div className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">
          ตัวอย่างใบเสร็จ
        </div>
        <div className="border border-border rounded-xl bg-muted/30 p-3 flex justify-center max-h-[80vh] overflow-y-auto scrollbar-thin">
          <div style={{ transform: 'scale(0.82)', transformOrigin: 'top center' }}>
            <Receipt order={SAMPLE_ORDER} store={previewStore} format="thermal" />
          </div>
        </div>
      </div>
    </div>
  );
}
