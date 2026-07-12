'use client';
import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2, Save, QrCode, Target } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { detectPromptPayType, formatPromptPayId } from '@/lib/promptpay';
import { useT } from '@/lib/i18n';

export type StoreSettingsSection = 'store' | 'tax' | 'promptpay' | 'goals';

interface StoreSettingsFormProps {
  /** When provided, only renders these section cards. Otherwise renders everything. */
  sections?: StoreSettingsSection[];
  /** Hide the floating save button (caller provides its own). */
  hideSaveButton?: boolean;
}

export function StoreSettingsForm({ sections, hideSaveButton }: StoreSettingsFormProps = {}) {
  const t = useT();
  const qc = useQueryClient();
  const show = (key: StoreSettingsSection) => !sections || sections.includes(key);

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
        dailyTarget: String(store.dailyTarget || 0),
        monthlyTarget: String(store.monthlyTarget || 0),
      });
    }
  }, [store]);

  const save = useMutation({
    mutationFn: (payload: any) => api.patch('/stores/me', payload).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['store-me'] });
      toast.success(t('storeSettings.saved'));
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error || t('storeSettings.saveFailed'));
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
      dailyTarget: Number(form.dailyTarget) || 0,
      monthlyTarget: Number(form.monthlyTarget) || 0,
    });
  };

  const ppType = form.promptpayId ? detectPromptPayType(form.promptpayId) : null;

  if (isLoading) {
    return <div className="shimmer h-96 rounded-2xl" />;
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {show('store') && (
      <Card>
        <CardHeader>
          <CardTitle>{t('storeSettings.storeInfo')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label className="mb-1.5 block">{t('storeSettings.storeName')}</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </div>
          <div>
            <Label className="mb-1.5 block">{t('storeSettings.address')}</Label>
            <textarea
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              className="w-full bg-input border border-border rounded-lg px-3 py-2 text-sm"
              rows={2}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="mb-1.5 block">{t('storeSettings.phone')}</Label>
              <Input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>
            <div>
              <Label className="mb-1.5 block">{t('storeSettings.logoUrl')}</Label>
              <Input
                value={form.logo}
                onChange={(e) => setForm({ ...form, logo: e.target.value })}
                placeholder="https://..."
              />
            </div>
          </div>
        </CardContent>
      </Card>
      )}

      {show('tax') && (
      <Card>
        <CardHeader>
          <CardTitle>{t('storeSettings.taxInvoicing')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="mb-1.5 block">{t('storeSettings.taxId')}</Label>
              <Input
                value={form.taxId}
                onChange={(e) => setForm({ ...form, taxId: e.target.value })}
                maxLength={13}
              />
            </div>
            <div>
              <Label className="mb-1.5 block">{t('storeSettings.branchCode')}</Label>
              <Input
                value={form.branchCode}
                onChange={(e) => setForm({ ...form, branchCode: e.target.value })}
                maxLength={5}
                placeholder="00000 = HQ"
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="mb-1.5 block">{t('storeSettings.vat')}</Label>
              <Input
                type="number" step="0.01" min="0" max="100"
                value={form.taxRate}
                onChange={(e) => setForm({ ...form, taxRate: e.target.value })}
              />
            </div>
            <div>
              <Label className="mb-1.5 block">{t('storeSettings.serviceCharge')}</Label>
              <Input
                type="number" step="0.01" min="0" max="100"
                value={form.serviceCharge}
                onChange={(e) => setForm({ ...form, serviceCharge: e.target.value })}
              />
            </div>
            <div>
              <Label className="mb-1.5 block">{t('storeSettings.invoicePrefix')}</Label>
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
              <div className="text-sm font-medium">{t('storeSettings.priceIncludesVat')}</div>
              <div className="text-xs text-muted-foreground mt-0.5 whitespace-pre-line">
                {t('storeSettings.priceIncludesVatHint')}
              </div>
            </div>
          </label>
        </CardContent>
      </Card>
      )}

      {show('promptpay') && (
      <Card>
        <CardHeader>
          <CardTitle>
            <span className="flex items-center gap-2">
              <QrCode className="w-5 h-5" /> {t('storeSettings.promptpayTitle')}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label className="mb-1.5 block">{t('storeSettings.promptpayId')}</Label>
            <Input
              value={form.promptpayId}
              onChange={(e) => setForm({ ...form, promptpayId: e.target.value })}
              placeholder={t('storeSettings.promptpayPlaceholder')}
            />
            <p className="text-xs text-muted-foreground mt-1.5">
              {ppType === 'MOBILE' && `${t('storeSettings.promptpayMobile')}: ${formatPromptPayId(form.promptpayId)}`}
              {ppType === 'NATIONAL_ID' && `${t('storeSettings.promptpayNationalId')}: ${formatPromptPayId(form.promptpayId)}`}
              {ppType === 'EWALLET' && t('storeSettings.promptpayEwallet')}
              {form.promptpayId && !ppType && (
                <span className="text-danger">{t('storeSettings.promptpayInvalid')}</span>
              )}
              {!form.promptpayId && t('storeSettings.promptpayHint')}
            </p>
          </div>
        </CardContent>
      </Card>
      )}

      {show('goals') && (
      <Card>
        <CardHeader>
          <CardTitle>
            <span className="flex items-center gap-2">
              <Target className="w-5 h-5 text-warning" /> {t('storeSettings.goalsTitle')}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            {t('storeSettings.goalsHint')}
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="mb-1.5 block">{t('storeSettings.dailyTarget')}</Label>
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
              <Label className="mb-1.5 block">{t('storeSettings.monthlyTarget')}</Label>
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
      )}

      {!hideSaveButton && (
        <div className="flex justify-end gap-2 sticky bottom-0 bg-background py-4">
          <Button type="submit" size="lg" disabled={save.isPending}>
            {save.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <Save className="w-4 h-4 mr-1" /> {t('storeSettings.saveButton')}
              </>
            )}
          </Button>
        </div>
      )}
    </form>
  );
}
