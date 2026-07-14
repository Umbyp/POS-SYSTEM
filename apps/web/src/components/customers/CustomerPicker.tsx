'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, UserPlus, Phone, X, Loader2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { CartCustomer } from '@/stores/cart.store';

interface Props {
  open: boolean;
  onClose: () => void;
  onSelect: (c: CartCustomer) => void;
}

export function CustomerPicker({ open, onClose, onSelect }: Props) {
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [tab, setTab] = useState<'search' | 'new'>('search');
  const [form, setForm] = useState({ name: '', phone: '', email: '', taxId: '' });

  const { data: customers = [], isLoading } = useQuery({
    queryKey: ['customers', q],
    queryFn: () =>
      api.get('/customers', { params: { q: q || undefined } }).then((r) => r.data),
    enabled: open && tab === 'search',
  });

  const create = useMutation({
    mutationFn: (payload: any) =>
      api.post('/customers', payload).then((r) => r.data),
    onSuccess: (c) => {
      qc.invalidateQueries({ queryKey: ['customers'] });
      toast.success(`Added "${c.name}"`);
      onSelect({ id: c.id, name: c.name, phone: c.phone, points: c.points, stamps: c.stamps });
      onClose();
      setForm({ name: '', phone: '', email: '', taxId: '' });
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed to add'),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto scrollbar-thin">
        <DialogHeader>
          <DialogTitle>Select customer</DialogTitle>
        </DialogHeader>

        <div className="flex gap-1 p-1 bg-muted rounded-lg text-sm">
          <button
            onClick={() => setTab('search')}
            className={`flex-1 py-1.5 rounded-md ${
              tab === 'search' ? 'bg-card font-medium' : 'text-muted-foreground'
            }`}
          >
            Search
          </button>
          <button
            onClick={() => setTab('new')}
            className={`flex-1 py-1.5 rounded-md ${
              tab === 'new' ? 'bg-card font-medium' : 'text-muted-foreground'
            }`}
          >
            New customer
          </button>
        </div>

        {tab === 'search' ? (
          <>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Name / phone / email..."
                className="pl-10"
                autoFocus
              />
            </div>

            <div className="space-y-1.5 max-h-80 overflow-y-auto scrollbar-thin">
              {isLoading ? (
                <div className="text-center py-6 text-muted-foreground text-sm">
                  Loading...
                </div>
              ) : customers.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground text-sm">
                  {q ? 'No customers found — try adding new' : 'No customers yet'}
                </div>
              ) : (
                customers.map((c: any) => (
                  <button
                    key={c.id}
                    onClick={() => {
                      onSelect({
                        id: c.id,
                        name: c.name,
                        phone: c.phone,
                        points: c.points,
                        stamps: c.stamps,
                      });
                      onClose();
                    }}
                    className="w-full p-3 rounded-lg border border-border hover:border-primary hover:bg-primary/5 transition-colors text-left"
                  >
                    <div className="flex items-center justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="font-medium truncate">{c.name}</div>
                        <div className="text-xs text-muted-foreground flex items-center gap-3 mt-0.5">
                          {c.phone && (
                            <span className="flex items-center gap-1">
                              <Phone className="w-3 h-3" /> {c.phone}
                            </span>
                          )}
                          <span>{c.visitCount} visit{c.visitCount !== 1 ? 's' : ''}</span>
                        </div>
                      </div>
                      {c.points > 0 && (
                        <Badge variant="accent" className="text-[10px]">
                          <Sparkles className="w-3 h-3 mr-0.5" />
                          {c.points} pts
                        </Badge>
                      )}
                    </div>
                  </button>
                ))
              )}
            </div>
          </>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              create.mutate({
                name: form.name,
                phone: form.phone || null,
                email: form.email || null,
                taxId: form.taxId || null,
              });
            }}
            className="space-y-3"
          >
            <div>
              <Label className="mb-1.5 block">Full name *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
                autoFocus
              />
            </div>
            <div>
              <Label className="mb-1.5 block">Phone</Label>
              <Input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="081-234-5678"
              />
            </div>
            <div>
              <Label className="mb-1.5 block">Email</Label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div>
              <Label className="mb-1.5 block">Tax ID (if any)</Label>
              <Input
                value={form.taxId}
                onChange={(e) => setForm({ ...form, taxId: e.target.value })}
                maxLength={13}
              />
            </div>
            <Button type="submit" className="w-full" disabled={create.isPending}>
              {create.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <UserPlus className="w-4 h-4 mr-1" /> Add + Select
                </>
              )}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
