'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Store, ChevronDown, Plus, Check, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useAuth } from '@/stores/auth.store';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useT } from '@/lib/i18n';

export function StoreSwitcher() {
  const t = useT();
  const qc = useQueryClient();
  const { user, setAuth } = useAuth();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  const { data: stores = [] } = useQuery({
    queryKey: ['my-stores'],
    queryFn: () => api.get('/stores/mine').then((r) => r.data),
    enabled: !!user,
  });

  const currentStore = stores.find((s: any) => s.isCurrent);

  const switchStore = useMutation({
    mutationFn: (storeId: string) =>
      api.post('/stores/switch', { storeId }).then((r) => r.data),
    onSuccess: (data) => {
      localStorage.setItem('token', data.token);
      setAuth(data.user, data.token);
      qc.invalidateQueries();
      toast.success(t('storeSwitcher.switched'));
      setOpen(false);
      window.location.reload(); // refresh to reload all store data
    },
    onError: (e: any) => toast.error(e.response?.data?.error || t('storeSwitcher.switchFailed')),
  });

  if (stores.length <= 1) {
    // Only one store — no switcher needed
    return null;
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="hidden md:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border bg-card hover:bg-card-hover text-xs transition-colors max-w-[180px]"
      >
        <Store className="w-3.5 h-3.5 text-primary shrink-0" />
        <span className="truncate font-medium">{currentStore?.name || t('storeSwitcher.select')}</span>
        <ChevronDown className="w-3 h-3 text-muted-foreground shrink-0" />
      </button>

      <Dialog open={open} onOpenChange={(o) => !o && setOpen(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Store className="w-5 h-5" /> {t('storeSwitcher.title')}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-2 max-h-72 overflow-y-auto scrollbar-thin">
            {stores.map((s: any) => (
              <button
                key={s.id}
                disabled={s.isCurrent || switchStore.isPending}
                onClick={() => switchStore.mutate(s.id)}
                className={`w-full p-3 rounded-lg border-2 text-left transition-all ${
                  s.isCurrent
                    ? 'border-primary bg-primary/10'
                    : 'border-border hover:border-primary/40 hover:bg-muted/50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate">{s.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {s.address || t('storeSwitcher.noAddress')} · {t('storeSwitcher.role')}: {s.role}
                    </div>
                  </div>
                  {s.isCurrent && (
                    <Check className="w-5 h-5 text-primary shrink-0" />
                  )}
                </div>
              </button>
            ))}
          </div>

          <Button variant="outline" onClick={() => setCreating(true)} className="w-full">
            <Plus className="w-4 h-4 mr-1" /> {t('storeSwitcher.createNew')}
          </Button>
        </DialogContent>
      </Dialog>

      <CreateStoreDialog open={creating} onClose={() => setCreating(false)} />
    </>
  );
}

function CreateStoreDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT();
  const qc = useQueryClient();
  const [form, setForm] = useState({ name: '', address: '', phone: '' });

  const create = useMutation({
    mutationFn: (payload: any) => api.post('/stores', payload).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-stores'] });
      toast.success(t('storeSwitcher.created'));
      onClose();
      setForm({ name: '', address: '', phone: '' });
    },
    onError: (e: any) => toast.error(e.response?.data?.error || t('storeSwitcher.createFailed')),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('storeSwitcher.createNew')}</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">
          {t('storeSwitcher.createHint')}
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate({
              name: form.name,
              address: form.address || null,
              phone: form.phone || null,
            });
          }}
          className="space-y-3"
        >
          <div>
            <Label className="mb-1.5 block">{t('storeSettings.storeName')}</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
              autoFocus
            />
          </div>
          <div>
            <Label className="mb-1.5 block">{t('storeSettings.address')}</Label>
            <Input
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
            />
          </div>
          <div>
            <Label className="mb-1.5 block">{t('storeSettings.phone')}</Label>
            <Input
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </div>
          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" className="flex-1" disabled={create.isPending}>
              {create.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                t('storeSwitcher.createNew')
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
