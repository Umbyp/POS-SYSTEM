'use client';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
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

type Role = 'OWNER' | 'ADMIN' | 'CASHIER' | 'KITCHEN';

const ROLE_OPTIONS: { value: Role; labelKey: string; descKey: string }[] = [
  { value: 'CASHIER', labelKey: 'employee.role.cashier', descKey: 'employee.role.cashierDesc' },
  { value: 'KITCHEN', labelKey: 'employee.role.kitchen', descKey: 'employee.role.kitchenDesc' },
  { value: 'ADMIN', labelKey: 'employee.role.admin', descKey: 'employee.role.adminDesc' },
  { value: 'OWNER', labelKey: 'employee.role.owner', descKey: 'employee.role.ownerDesc' },
];

interface Props {
  open: boolean;
  onClose: () => void;
}

export function AddEmployeeDialog({ open, onClose }: Props) {
  const t = useT();
  const qc = useQueryClient();
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    role: 'CASHIER' as Role,
  });

  const create = useMutation({
    mutationFn: (payload: typeof form) =>
      api.post('/employees', payload).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['employees'] });
      toast.success(t('employee.added'));
      setForm({ name: '', email: '', password: '', role: 'CASHIER' });
      onClose();
    },
    onError: (err: any) => {
      const msg = err.response?.data?.error || err.response?.data?.message || t('employee.addFailed');
      toast.error(msg);
    },
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (form.password.length < 6) {
      toast.error(t('employee.passwordTooShort'));
      return;
    }
    create.mutate(form);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="w-5 h-5" /> {t('employee.addNew')}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-3">
          <div>
            <Label className="mb-1.5 block">{t('employee.fullName')}</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder={t('employee.namePlaceholder')}
              required
              autoFocus
            />
          </div>

          <div>
            <Label className="mb-1.5 block">{t('employee.email')}</Label>
            <Input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="staff@example.com"
              required
            />
          </div>

          <div>
            <Label className="mb-1.5 block">{t('employee.password')}</Label>
            <Input
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder="••••••••"
              minLength={6}
              required
            />
            <p className="text-xs text-muted-foreground mt-1">
              {t('employee.passwordHint')}
            </p>
          </div>

          <div>
            <Label className="mb-1.5 block">{t('employee.role')}</Label>
            <div className="space-y-1.5">
              {ROLE_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  className={`flex items-start gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                    form.role === opt.value
                      ? 'border-primary bg-primary/10'
                      : 'border-border hover:bg-muted/50'
                  }`}
                >
                  <input
                    type="radio"
                    name="role"
                    value={opt.value}
                    checked={form.role === opt.value}
                    onChange={() => setForm({ ...form, role: opt.value })}
                    className="mt-1 accent-primary"
                  />
                  <div className="flex-1">
                    <div className="text-sm font-medium">{t(opt.labelKey)}</div>
                    <div className="text-xs text-muted-foreground">{t(opt.descKey)}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" className="flex-1" disabled={create.isPending}>
              {create.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                t('employee.add')
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
