'use client';
import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Sparkles,
  Phone,
  Mail,
  MapPin,
  Calendar,
  ShoppingBag,
  TrendingUp,
  Edit3,
  Save,
  X,
  Receipt as ReceiptIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/format';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function CustomerDetailPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const { id } = useParams<{ id: string }>();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', email: '', taxId: '', address: '', notes: '' });

  const { data: customer, isLoading } = useQuery({
    queryKey: ['customer', id],
    queryFn: () => api.get(`/customers/${id}`).then((r) => r.data),
  });

  useEffect(() => {
    if (customer) {
      setForm({
        name: customer.name || '',
        phone: customer.phone || '',
        email: customer.email || '',
        taxId: customer.taxId || '',
        address: customer.address || '',
        notes: customer.notes || '',
      });
    }
  }, [customer]);

  const save = useMutation({
    mutationFn: (payload: any) =>
      api.patch(`/customers/${id}`, payload).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customer', id] });
      qc.invalidateQueries({ queryKey: ['customers-list'] });
      toast.success('Saved');
      setEditing(false);
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Save failed'),
  });

  if (isLoading || !customer) {
    return <div className="p-6 text-muted-foreground">Loading...</div>;
  }

  const avgPerVisit =
    customer.visitCount > 0 ? Number(customer.totalSpent) / customer.visitCount : 0;

  return (
    <div className="p-4 sm:p-6 h-full overflow-y-auto scrollbar-thin">
      <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => router.back()}>
            <ArrowLeft className="w-4 h-4 mr-1" /> Back
          </Button>
          <h2 className="text-lg sm:text-xl font-bold">{customer.name}</h2>
        </div>
        {!editing && (
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            <Edit3 className="w-4 h-4 mr-1" /> Edit
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Profile */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Customer information</CardTitle>
          </CardHeader>
          <CardContent>
            {editing ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  save.mutate({
                    name: form.name,
                    phone: form.phone || null,
                    email: form.email || null,
                    taxId: form.taxId || null,
                    address: form.address || null,
                    notes: form.notes || null,
                  });
                }}
                className="space-y-3"
              >
                <div>
                  <Label className="mb-1.5 block">Name *</Label>
                  <Input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <Label className="mb-1.5 block">Phone</Label>
                  <Input
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
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
                  <Label className="mb-1.5 block">Tax ID</Label>
                  <Input
                    value={form.taxId}
                    onChange={(e) => setForm({ ...form, taxId: e.target.value })}
                    maxLength={13}
                  />
                </div>
                <div>
                  <Label className="mb-1.5 block">Address</Label>
                  <textarea
                    value={form.address}
                    onChange={(e) => setForm({ ...form, address: e.target.value })}
                    className="w-full bg-input border border-border rounded-lg px-3 py-2 text-sm"
                    rows={2}
                  />
                </div>
                <div>
                  <Label className="mb-1.5 block">Notes</Label>
                  <textarea
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    className="w-full bg-input border border-border rounded-lg px-3 py-2 text-sm"
                    rows={2}
                    placeholder="VIP customer, lactose intolerant, etc."
                  />
                </div>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" className="flex-1" onClick={() => setEditing(false)}>
                    <X className="w-4 h-4 mr-1" /> Cancel
                  </Button>
                  <Button type="submit" className="flex-1" disabled={save.isPending}>
                    <Save className="w-4 h-4 mr-1" /> Save
                  </Button>
                </div>
              </form>
            ) : (
              <div className="space-y-2 text-sm">
                {customer.phone && (
                  <Row icon={<Phone className="w-4 h-4" />} label="Phone" value={customer.phone} />
                )}
                {customer.email && (
                  <Row icon={<Mail className="w-4 h-4" />} label="Email" value={customer.email} />
                )}
                {customer.taxId && <Row label="Tax ID" value={customer.taxId} />}
                {customer.address && (
                  <Row
                    icon={<MapPin className="w-4 h-4" />}
                    label="Address"
                    value={customer.address}
                  />
                )}
                <Row
                  icon={<Calendar className="w-4 h-4" />}
                  label="Customer since"
                  value={formatDate(customer.createdAt)}
                />
                {customer.notes && (
                  <div className="pt-2 mt-2 border-t border-border">
                    <div className="text-xs text-muted-foreground mb-1">Notes</div>
                    <div className="text-sm italic">{customer.notes}</div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Stats */}
        <div className="space-y-4 lg:col-span-2">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard
              icon={<TrendingUp className="w-4 h-4" />}
              label="Total spent"
              value={formatCurrency(customer.totalSpent)}
              accent
            />
            <StatCard
              icon={<ShoppingBag className="w-4 h-4" />}
              label="Total visits"
              value={`${customer.visitCount} visit${customer.visitCount !== 1 ? 's' : ''}`}
            />
            <StatCard
              icon={<ReceiptIcon className="w-4 h-4" />}
              label="Avg/visit"
              value={formatCurrency(avgPerVisit)}
            />
            <StatCard
              icon={<Sparkles className="w-4 h-4" />}
              label="Loyalty points"
              value={`${customer.points} pts`}
              highlight
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Order history</CardTitle>
            </CardHeader>
            <CardContent>
              {customer.orders?.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  No order history yet
                </p>
              ) : (
                <div className="space-y-2">
                  {customer.orders?.map((o: any) => (
                    <button
                      key={o.id}
                      onClick={() => router.push(`/orders/${o.id}`)}
                      className="w-full p-3 rounded-lg border border-border hover:bg-card-hover transition-colors text-left"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="font-mono text-xs text-muted-foreground">
                            {o.orderNumber}
                          </div>
                          <div className="text-sm font-medium">
                            {o.items.length} items
                            <span className="text-muted-foreground ml-2 text-xs">
                              {o.items
                                .slice(0, 3)
                                .map((i: any) => i.product.name)
                                .join(', ')}
                              {o.items.length > 3 && '...'}
                            </span>
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {formatDate(o.createdAt)}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="font-bold tabular-nums text-accent">
                            {formatCurrency(o.total)}
                          </div>
                          <Badge
                            variant={
                              o.status === 'REFUNDED' || o.status === 'CANCELLED'
                                ? 'danger'
                                : 'success'
                            }
                            className="text-[10px] mt-1"
                          >
                            {o.status}
                          </Badge>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Row({ icon, label, value }: { icon?: any; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      {icon && <span className="text-muted-foreground mt-0.5">{icon}</span>}
      <div className="flex-1 min-w-0">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="font-medium break-words">{value}</div>
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  accent,
  highlight,
}: {
  icon: any;
  label: string;
  value: string;
  accent?: boolean;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-xl p-3 border ${
        highlight
          ? 'border-accent/40 bg-accent/10'
          : accent
          ? 'border-primary/40 bg-primary/5'
          : 'border-border bg-card'
      }`}
    >
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
        {icon} {label}
      </div>
      <div
        className={`font-bold tabular-nums ${
          highlight ? 'text-accent' : accent ? 'text-primary' : 'text-foreground'
        }`}
      >
        {value}
      </div>
    </div>
  );
}
