'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  UserPlus,
  Search,
  Sparkles,
  Phone,
  Mail,
  Calendar,
  ShoppingBag,
  Trash2,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/format';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { CustomerPicker } from '@/components/customers/CustomerPicker';
import { useT } from '@/lib/i18n';

export default function CustomersPage() {
  const t = useT();
  const router = useRouter();
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);

  const { data: customers = [], isLoading } = useQuery({
    queryKey: ['customers-list', q],
    queryFn: () =>
      api.get('/customers', { params: { q: q || undefined } }).then((r) => r.data),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/customers/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customers-list'] });
      qc.invalidateQueries({ queryKey: ['customers'] });
      toast.success(t('customers.deleted'));
    },
    onError: (e: any) => toast.error(e.response?.data?.error || t('customers.deleteFailed')),
  });

  return (
    <div className="p-4 sm:p-6 h-full overflow-y-auto scrollbar-thin">
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <h2 className="text-lg sm:text-xl font-extrabold tracking-tight flex items-center gap-2">
          <Users className="w-5 h-5 text-primary" /> {t('nav.customers')}{' '}
          <span className="text-muted-foreground font-semibold text-base">({customers.length})</span>
        </h2>
        <Button onClick={() => setPickerOpen(true)}>
          <UserPlus className="w-4 h-4 mr-1.5" /> {t('customers.add')}
        </Button>
      </div>

      <div className="relative mb-4 max-w-md">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t('customers.searchPlaceholder')}
          className="pl-10 h-10 rounded-lg"
        />
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="shimmer h-24 rounded-xl" />
          ))}
        </div>
      ) : customers.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <Users className="w-12 h-12 mb-3 opacity-30" />
          <p className="text-sm mb-3">
            {q ? t('customers.noneFound') : t('customers.noneYet')}
          </p>
          <Button onClick={() => setPickerOpen(true)}>
            <UserPlus className="w-4 h-4 mr-1" /> {t('customers.addFirst')}
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {customers.map((c: any) => (
            <div
              key={c.id}
              onClick={() => router.push(`/customers/${c.id}`)}
              className="bg-card border border-border rounded-xl p-4 hover:bg-card-hover hover:border-primary/40 transition-colors cursor-pointer"
            >
              <div className="flex items-start justify-between gap-2 mb-3">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="w-10 h-10 rounded-full bg-primary/15 text-primary flex items-center justify-center text-sm font-extrabold shrink-0">
                    {c.name[0]}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-bold truncate">{c.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {c.visitCount} {t(c.visitCount !== 1 ? 'customers.visits' : 'customers.visit')}
                    </div>
                  </div>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm(`${t('customers.confirmDelete')} "${c.name}"?`)) remove.mutate(c.id);
                  }}
                  className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-danger transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-1 text-xs text-muted-foreground">
                {c.phone && (
                  <div className="flex items-center gap-1.5">
                    <Phone className="w-3 h-3" />
                    <span>{c.phone}</span>
                  </div>
                )}
                {c.email && (
                  <div className="flex items-center gap-1.5 truncate">
                    <Mail className="w-3 h-3 shrink-0" />
                    <span className="truncate">{c.email}</span>
                  </div>
                )}
                {c.lastVisitAt && (
                  <div className="flex items-center gap-1.5">
                    <Calendar className="w-3 h-3" />
                    <span>{t('customers.lastVisit')} {formatDate(c.lastVisitAt)}</span>
                  </div>
                )}
              </div>

              <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-border">
                <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-full bg-success/10 text-success">
                  <ShoppingBag className="w-3 h-3" />
                  {t('customers.spent')} {formatCurrency(c.totalSpent)}
                </span>
                {c.points > 0 && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-full bg-accent/10 text-accent">
                    <Sparkles className="w-3 h-3" />
                    {c.points} {t('cart.points')}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <CustomerPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={() => {
          qc.invalidateQueries({ queryKey: ['customers-list'] });
        }}
      />
    </div>
  );
}
