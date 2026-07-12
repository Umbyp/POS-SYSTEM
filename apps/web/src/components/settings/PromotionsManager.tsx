'use client';
import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Edit3, Trash2, Tag, Power, Calendar, Clock, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { formatCurrency } from '@/lib/format';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useT } from '@/lib/i18n';

const EMPTY_FORM = {
  name: '',
  code: '',
  type: 'PERCENT_OFF',
  scope: 'ALL_ORDER',
  value: '',
  buyQty: '',
  getQty: '',
  minSpend: '',
  daysOfWeek: [] as number[],
  hourStart: '',
  hourEnd: '',
  memberOnly: false,
  usageLimit: '',
};

// Map a saved promotion into the form shape (nulls -> '', keeps 0 values).
function promoToForm(p: any) {
  if (!p) return { ...EMPTY_FORM };
  return {
    name: p.name ?? '',
    code: p.code ?? '',
    type: p.type ?? 'PERCENT_OFF',
    scope: p.scope ?? 'ALL_ORDER',
    value: p.value ?? '',
    buyQty: p.buyQty ?? '',
    getQty: p.getQty ?? '',
    minSpend: p.minSpend ?? '',
    daysOfWeek: p.daysOfWeek ?? [],
    hourStart: p.hourStart ?? '',
    hourEnd: p.hourEnd ?? '',
    memberOnly: p.memberOnly ?? false,
    usageLimit: p.usageLimit ?? '',
  };
}

export function PromotionsManager() {
  const t = useT();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<any>(null);
  const [creating, setCreating] = useState(false);

  const { data: promos = [] } = useQuery({
    queryKey: ['promotions'],
    queryFn: () => api.get('/promotions').then((r) => r.data),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/promotions/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['promotions'] });
      toast.success(t('promo.deleted'));
    },
  });

  const toggleActive = useMutation({
    mutationFn: ({ id, isActive }: any) =>
      api.patch(`/promotions/${id}`, { isActive }).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['promotions'] }),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Tag className="w-5 h-5" /> {t('promo.title')}
          </span>
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="w-4 h-4 mr-1" /> {t('promo.add')}
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {promos.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            {t('promo.empty')}
          </p>
        ) : (
          <div className="space-y-2">
            {promos.map((p: any) => (
              <div
                key={p.id}
                className={`p-3 rounded-lg border transition-colors ${
                  p.isActive ? 'border-primary/30 bg-primary/5' : 'border-border opacity-60'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-medium truncate">{p.name}</span>
                      <Badge variant="accent" className="text-[10px]">
                        {t(`promo.type.${p.type}`, p.type)}
                      </Badge>
                      <Badge variant="default" className="text-[10px]">
                        {t(`promo.scope.${p.scope}`, p.scope)}
                      </Badge>
                      {p.code && (
                        <Badge variant="warning" className="text-[10px] font-mono">
                          {t('promo.code')}: {p.code}
                        </Badge>
                      )}
                      {p.memberOnly && (
                        <Badge variant="success" className="text-[10px]">
                          {t('promo.membersOnly')}
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground flex items-center flex-wrap gap-x-3 gap-y-0.5">
                      <span>
                        {t('promo.value')}: <strong>{p.value}</strong>
                        {p.type === 'PERCENT_OFF' && '%'}
                      </span>
                      {p.type === 'BUY_X_GET_Y' && (
                        <span>{t('promo.buy')} {p.buyQty} {t('promo.get')} {p.getQty}</span>
                      )}
                      {p.minSpend && (
                        <span>{t('promo.min')} {formatCurrency(p.minSpend)}</span>
                      )}
                      {p.daysOfWeek?.length > 0 && (
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {p.daysOfWeek.map((d: number) => t(`promo.dow.${d}`)).join(',')}
                        </span>
                      )}
                      {p.hourStart != null && (
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {String(p.hourStart).padStart(2, '0')}-{String(p.hourEnd).padStart(2, '0')}
                        </span>
                      )}
                      {p.usageLimit && (
                        <span>
                          {t('promo.used')} {p.usageCount}/{p.usageLimit}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => toggleActive.mutate({ id: p.id, isActive: !p.isActive })}
                      className={`p-1.5 rounded ${
                        p.isActive
                          ? 'text-success hover:bg-success/10'
                          : 'text-muted-foreground hover:bg-muted'
                      }`}
                      title={p.isActive ? t('promo.disable') : t('promo.enable')}
                    >
                      <Power className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setEditing(p)}
                      className="p-1.5 rounded hover:bg-muted text-muted-foreground"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(`${t('promo.confirmDelete')} "${p.name}"?`)) remove.mutate(p.id);
                      }}
                      className="p-1.5 rounded hover:bg-muted text-danger"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <PromotionDialog
        open={creating || !!editing}
        editing={editing}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
      />
    </Card>
  );
}

function PromotionDialog({
  open,
  editing,
  onClose,
}: {
  open: boolean;
  editing: any;
  onClose: () => void;
}) {
  const t = useT();
  const qc = useQueryClient();
  const isEdit = !!editing;

  const [form, setForm] = useState<any>(() => promoToForm(editing));

  // Re-sync the form every time the dialog opens — populate from the promotion
  // being edited, or reset to a blank form when creating a new one.
  useEffect(() => {
    if (open) setForm(promoToForm(editing));
  }, [open, editing]);

  const save = useMutation({
    mutationFn: (payload: any) =>
      isEdit
        ? api.patch(`/promotions/${editing.id}`, payload).then((r) => r.data)
        : api.post('/promotions', payload).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['promotions'] });
      toast.success(isEdit ? t('promo.saved') : t('promo.created'));
      onClose();
    },
    onError: (e: any) => toast.error(e.response?.data?.error || t('promo.saveFailed')),
  });

  const toggleDay = (d: number) => {
    const cur = form.daysOfWeek || [];
    setForm({
      ...form,
      daysOfWeek: cur.includes(d) ? cur.filter((x: number) => x !== d) : [...cur, d],
    });
  };

  const handleSubmit = () => {
    const payload: any = {
      name: form.name,
      code: form.code || null,
      type: form.type,
      scope: form.scope,
      value: parseFloat(form.value) || 0,
      buyQty: form.buyQty ? parseInt(form.buyQty) : null,
      getQty: form.getQty ? parseInt(form.getQty) : null,
      minSpend: form.minSpend ? parseFloat(form.minSpend) : null,
      daysOfWeek: form.daysOfWeek || [],
      hourStart: form.hourStart !== '' ? parseInt(form.hourStart) : null,
      hourEnd: form.hourEnd !== '' ? parseInt(form.hourEnd) : null,
      memberOnly: !!form.memberOnly,
      usageLimit: form.usageLimit ? parseInt(form.usageLimit) : null,
    };
    save.mutate(payload);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto scrollbar-thin">
        <DialogHeader>
          <DialogTitle>{isEdit ? t('promo.editTitle') : t('promo.newTitle')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label className="mb-1.5 block">{t('promo.nameLabel')}</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder={t('promo.namePlaceholder')}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="mb-1.5 block">{t('promo.typeLabel')}</Label>
              <select
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
                className="w-full h-10 bg-input border border-border rounded-lg px-3 text-sm"
              >
                <option value="PERCENT_OFF">{t('promo.type.PERCENT_OFF')}</option>
                <option value="FIXED_OFF">{t('promo.type.FIXED_OFF')}</option>
                <option value="BUY_X_GET_Y">{t('promo.type.BUY_X_GET_Y')}</option>
                <option value="FIXED_PRICE">{t('promo.type.FIXED_PRICE')}</option>
              </select>
            </div>
            <div>
              <Label className="mb-1.5 block">{t('promo.scopeLabel')}</Label>
              <select
                value={form.scope}
                onChange={(e) => setForm({ ...form, scope: e.target.value })}
                className="w-full h-10 bg-input border border-border rounded-lg px-3 text-sm"
              >
                <option value="ALL_ORDER">{t('promo.scope.ALL_ORDER')}</option>
                <option value="CATEGORY">{t('promo.scope.CATEGORY')}</option>
                <option value="PRODUCT">{t('promo.scope.PRODUCT')}</option>
              </select>
            </div>
          </div>

          <div>
            <Label className="mb-1.5 block">
              {t('promo.valueRequired')} {form.type === 'PERCENT_OFF' && '(%)'} {form.type !== 'PERCENT_OFF' && '(฿)'}
            </Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={form.value}
              onChange={(e) => setForm({ ...form, value: e.target.value })}
            />
          </div>

          {form.type === 'BUY_X_GET_Y' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="mb-1.5 block">{t('promo.buyX')}</Label>
                <Input
                  type="number"
                  min="1"
                  value={form.buyQty}
                  onChange={(e) => setForm({ ...form, buyQty: e.target.value })}
                />
              </div>
              <div>
                <Label className="mb-1.5 block">{t('promo.getY')}</Label>
                <Input
                  type="number"
                  min="1"
                  value={form.getQty}
                  onChange={(e) => setForm({ ...form, getQty: e.target.value })}
                />
              </div>
            </div>
          )}

          <div>
            <Label className="mb-1.5 block">{t('promo.codeOptional')}</Label>
            <Input
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
              placeholder={t('promo.codePlaceholder')}
              className="font-mono uppercase"
            />
          </div>

          <div>
            <Label className="mb-1.5 block">{t('promo.minSpend')}</Label>
            <Input
              type="number"
              min="0"
              value={form.minSpend}
              onChange={(e) => setForm({ ...form, minSpend: e.target.value })}
              placeholder={t('promo.minSpendPlaceholder')}
            />
          </div>

          <div>
            <Label className="mb-1.5 block">{t('promo.daysOfWeek')}</Label>
            <div className="flex gap-1">
              {[0, 1, 2, 3, 4, 5, 6].map((i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => toggleDay(i)}
                  className={`flex-1 h-9 rounded-lg text-xs font-medium transition-colors ${
                    form.daysOfWeek?.includes(i)
                      ? 'bg-primary text-white'
                      : 'bg-muted text-muted-foreground hover:bg-muted/80'
                  }`}
                >
                  {t(`promo.dow.${i}`)}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="mb-1.5 block">{t('promo.startHour')}</Label>
              <Input
                type="number"
                min="0"
                max="23"
                value={form.hourStart}
                onChange={(e) => setForm({ ...form, hourStart: e.target.value })}
                placeholder="0-23"
              />
            </div>
            <div>
              <Label className="mb-1.5 block">{t('promo.endHour')}</Label>
              <Input
                type="number"
                min="0"
                max="23"
                value={form.hourEnd}
                onChange={(e) => setForm({ ...form, hourEnd: e.target.value })}
                placeholder="0-23"
              />
            </div>
          </div>

          <div>
            <Label className="mb-1.5 block">{t('promo.usageLimit')}</Label>
            <Input
              type="number"
              min="1"
              value={form.usageLimit}
              onChange={(e) => setForm({ ...form, usageLimit: e.target.value })}
              placeholder={t('promo.usageLimitPlaceholder')}
            />
          </div>

          <label className="flex items-center gap-2 p-2 rounded-lg border border-border">
            <input
              type="checkbox"
              checked={form.memberOnly}
              onChange={(e) => setForm({ ...form, memberOnly: e.target.checked })}
              className="w-4 h-4 accent-primary"
            />
            <span className="text-sm">{t('promo.membersOnlyCheckbox')}</span>
          </label>

          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button
              className="flex-1"
              onClick={handleSubmit}
              disabled={save.isPending || !form.name || !form.value}
            >
              {save.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : t('common.save')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
