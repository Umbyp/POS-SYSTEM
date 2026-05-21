'use client';
import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2, Save, QrCode, MessageCircle, ExternalLink, CheckCircle2, Target } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { detectPromptPayType, formatPromptPayId } from '@/lib/promptpay';

export function StoreSettingsForm() {
  const qc = useQueryClient();

  const { data: store, isLoading } = useQuery({
    queryKey: ['store-me'],
    queryFn: () => api.get('/stores/me').then((r) => r.data),
  });

  const [form, setForm] = useState<any>({
    name: '',
    address: '',
    phone: '',
    taxId: '',
    logo: '',
    currency: 'THB',
    taxRate: 7,
    priceIncludesTax: true,
    serviceCharge: 0,
    promptpayId: '',
    invoicePrefix: 'INV',
    branchCode: '00000',
    lineNotifyToken: '',
    dailyTarget: '0',
    monthlyTarget: '0',
  });

  useEffect(() => {
    if (store) {
      setForm({
        name: store.name || '',
        address: store.address || '',
        phone: store.phone || '',
        taxId: store.taxId || '',
        logo: store.logo || '',
        currency: store.currency || 'THB',
        taxRate: store.taxRate ?? 7,
        priceIncludesTax: store.priceIncludesTax ?? true,
        serviceCharge: store.serviceCharge ?? 0,
        promptpayId: store.promptpayId || '',
        invoicePrefix: store.invoicePrefix || 'INV',
        branchCode: store.branchCode || '00000',
        lineNotifyToken: store.lineNotifyToken || '',
        dailyTarget: String(store.dailyTarget || 0),
        monthlyTarget: String(store.monthlyTarget || 0),
      });
    }
  }, [store]);

  const save = useMutation({
    mutationFn: (payload: any) => api.patch('/stores/me', payload).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['store-me'] });
      toast.success('บันทึกการตั้งค่าแล้ว');
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error || 'บันทึกไม่สำเร็จ');
    },
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    save.mutate({
      name: form.name,
      address: form.address || null,
      phone: form.phone || null,
      taxId: form.taxId || null,
      logo: form.logo || null,
      currency: form.currency,
      taxRate: Number(form.taxRate),
      priceIncludesTax: Boolean(form.priceIncludesTax),
      serviceCharge: Number(form.serviceCharge),
      promptpayId: form.promptpayId || null,
      invoicePrefix: form.invoicePrefix || null,
      branchCode: form.branchCode || null,
      lineNotifyToken: form.lineNotifyToken || null,
      dailyTarget: Number(form.dailyTarget) || 0,
      monthlyTarget: Number(form.monthlyTarget) || 0,
    });
  };

  const [testingLine, setTestingLine] = useState(false);
  const testLine = async () => {
    if (!form.lineNotifyToken) {
      toast.error('กรุณาใส่ token ก่อน');
      return;
    }
    setTestingLine(true);
    try {
      const { data } = await api.post('/notifications/line/test', { token: form.lineNotifyToken });
      if (data.ok) toast.success(data.message);
      else toast.error(data.message);
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'ทดสอบไม่สำเร็จ');
    } finally {
      setTestingLine(false);
    }
  };

  const ppType = form.promptpayId ? detectPromptPayType(form.promptpayId) : null;

  if (isLoading) {
    return <div className="shimmer h-96 rounded-2xl" />;
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>ข้อมูลร้าน</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label className="mb-1.5 block">ชื่อร้าน *</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </div>
          <div>
            <Label className="mb-1.5 block">ที่อยู่</Label>
            <textarea
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              className="w-full bg-input border border-border rounded-lg px-3 py-2 text-sm"
              rows={2}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="mb-1.5 block">เบอร์โทร</Label>
              <Input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>
            <div>
              <Label className="mb-1.5 block">URL โลโก้</Label>
              <Input
                value={form.logo}
                onChange={(e) => setForm({ ...form, logo: e.target.value })}
                placeholder="https://..."
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>ภาษีและใบกำกับ</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="mb-1.5 block">เลขผู้เสียภาษี (13 หลัก)</Label>
              <Input
                value={form.taxId}
                onChange={(e) => setForm({ ...form, taxId: e.target.value })}
                maxLength={13}
              />
            </div>
            <div>
              <Label className="mb-1.5 block">รหัสสาขา (5 หลัก)</Label>
              <Input
                value={form.branchCode}
                onChange={(e) => setForm({ ...form, branchCode: e.target.value })}
                maxLength={5}
                placeholder="00000 = สำนักงานใหญ่"
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="mb-1.5 block">VAT (%)</Label>
              <Input
                type="number" step="0.01" min="0" max="100"
                value={form.taxRate}
                onChange={(e) => setForm({ ...form, taxRate: e.target.value })}
              />
            </div>
            <div>
              <Label className="mb-1.5 block">Service Charge (%)</Label>
              <Input
                type="number" step="0.01" min="0" max="100"
                value={form.serviceCharge}
                onChange={(e) => setForm({ ...form, serviceCharge: e.target.value })}
              />
            </div>
            <div>
              <Label className="mb-1.5 block">Invoice Prefix</Label>
              <Input
                value={form.invoicePrefix}
                onChange={(e) => setForm({ ...form, invoicePrefix: e.target.value })}
                placeholder="INV"
              />
            </div>
          </div>
          <label className="flex items-start gap-3 p-3 rounded-lg border border-border bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors">
            <input
              type="checkbox"
              checked={Boolean(form.priceIncludesTax)}
              onChange={(e) => setForm({ ...form, priceIncludesTax: e.target.checked })}
              className="mt-0.5 w-4 h-4 accent-primary"
            />
            <div className="flex-1">
              <div className="text-sm font-medium">ราคาสินค้ารวม VAT แล้ว</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                เปิด: ราคาที่ตั้งไว้รวม VAT แล้ว ระบบจะถอด VAT มาแสดงในใบเสร็จเพื่อยื่นภาษี (ไม่บวกซ้ำ)
                <br />
                ปิด: ราคาสินค้าไม่รวม VAT — ระบบจะบวก VAT เพิ่มจากยอดรวม
              </div>
            </div>
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            <span className="flex items-center gap-2">
              <QrCode className="w-5 h-5" /> PromptPay สำหรับรับเงิน
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label className="mb-1.5 block">PromptPay ID</Label>
            <Input
              value={form.promptpayId}
              onChange={(e) => setForm({ ...form, promptpayId: e.target.value })}
              placeholder="เบอร์มือถือ (10) / เลข ปชช (13) / eWallet (15)"
            />
            <p className="text-xs text-muted-foreground mt-1.5">
              {ppType === 'MOBILE' && `📱 เบอร์มือถือ: ${formatPromptPayId(form.promptpayId)}`}
              {ppType === 'NATIONAL_ID' && `🆔 เลขประจำตัวประชาชน: ${formatPromptPayId(form.promptpayId)}`}
              {ppType === 'EWALLET' && `💳 eWallet ID`}
              {form.promptpayId && !ppType && (
                <span className="text-danger">⚠️ รูปแบบไม่ถูกต้อง (ต้อง 10, 13, หรือ 15 หลัก)</span>
              )}
              {!form.promptpayId && 'ใส่เลขเพื่อสร้าง QR สำหรับรับเงินอัตโนมัติในหน้าจ่ายเงิน'}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            <span className="flex items-center gap-2">
              <Target className="w-5 h-5 text-warning" /> เป้ายอดขาย
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            ตั้งเป้าเพื่อเห็น progress ใน Dashboard (0 = ไม่ใช้เป้า)
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="mb-1.5 block">เป้ารายวัน (฿)</Label>
              <Input
                type="number"
                min="0"
                step="100"
                value={form.dailyTarget}
                onChange={(e) => setForm({ ...form, dailyTarget: e.target.value })}
                placeholder="0"
              />
            </div>
            <div>
              <Label className="mb-1.5 block">เป้ารายเดือน (฿)</Label>
              <Input
                type="number"
                min="0"
                step="1000"
                value={form.monthlyTarget}
                onChange={(e) => setForm({ ...form, monthlyTarget: e.target.value })}
                placeholder="0"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            <span className="flex items-center gap-2">
              <MessageCircle className="w-5 h-5 text-success" /> LINE Notify
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label className="mb-1.5 block">Access Token</Label>
            <div className="flex gap-2">
              <Input
                type="password"
                value={form.lineNotifyToken}
                onChange={(e) => setForm({ ...form, lineNotifyToken: e.target.value })}
                placeholder="LINE Notify access token (Bearer)"
                className="font-mono"
              />
              <Button
                type="button"
                variant="outline"
                onClick={testLine}
                disabled={testingLine || !form.lineNotifyToken}
              >
                {testingLine ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4 mr-1" /> ทดสอบ
                  </>
                )}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-1.5">
              ขอ token ฟรีที่{' '}
              <a
                href="https://notify-bot.line.me/my/"
                target="_blank"
                className="text-primary hover:underline inline-flex items-center gap-0.5"
                rel="noopener"
              >
                notify-bot.line.me <ExternalLink className="w-3 h-3" />
              </a>{' '}
              → "Generate token" → เลือกห้อง chat ที่ต้องการ
            </p>
          </div>
          {form.lineNotifyToken && (
            <div className="bg-success/10 border border-success/30 rounded-lg p-3 text-xs space-y-1">
              <div className="font-medium text-success">
                ✅ ระบบจะส่ง LINE notification เมื่อ:
              </div>
              <ul className="space-y-0.5 text-muted-foreground list-disc list-inside">
                <li>มีออเดอร์ใหม่ (พร้อมยอด, วิธีจ่าย, รายการ)</li>
                <li>เรียก /api/notifications/line/daily-summary (สรุปรายวัน)</li>
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2 sticky bottom-0 bg-background py-4">
        <Button type="submit" size="lg" disabled={save.isPending}>
          {save.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <>
              <Save className="w-4 h-4 mr-1" /> บันทึกการตั้งค่า
            </>
          )}
        </Button>
      </div>
    </form>
  );
}
