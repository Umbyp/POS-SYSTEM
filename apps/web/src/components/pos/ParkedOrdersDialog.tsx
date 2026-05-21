'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ClipboardList, Trash2, ShoppingCart, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { formatCurrency, formatTime } from '@/lib/format';
import { useCart } from '@/stores/cart.store';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface Props {
  open: boolean;
  onClose: () => void;
}

export function ParkedOrdersDialog({ open, onClose }: Props) {
  const qc = useQueryClient();
  const cart = useCart();

  const { data: parked = [], isLoading } = useQuery({
    queryKey: ['parked-orders'],
    queryFn: () => api.get('/orders/parked').then((r) => r.data),
    enabled: open,
    refetchInterval: open ? 5_000 : false,
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/orders/parked/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['parked-orders'] });
      qc.invalidateQueries({ queryKey: ['parked-count'] });
      qc.invalidateQueries({ queryKey: ['tables'] });
      toast.success('Parked order removed');
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed to delete'),
  });

  const recall = async (order: any) => {
    if (cart.items.length > 0) {
      if (!confirm('Current cart has items — recalling this order will overwrite them. Continue?')) {
        return;
      }
    }
    // Load items into cart
    cart.clear();
    order.items.forEach((it: any) => {
      cart.addItem({
        productId: it.productId,
        name: it.product.name,
        unitPrice: Number(it.unitPrice),
        quantity: it.quantity,
        notes: it.notes,
        variants: it.variants,
      });
    });
    if (order.tableId) cart.setTable(order.tableId);
    if (order.customer) {
      cart.setCustomer({
        id: order.customer.id,
        name: order.customer.name,
        phone: order.customer.phone,
        points: order.customer.points,
      });
    }
    cart.setType(order.type);
    cart.setDiscount(Number(order.discount || 0));
    // Remove parked after loading to prevent duplicates
    await remove.mutateAsync(order.id);
    toast.success('Order loaded into cart');
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto scrollbar-thin">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardList className="w-5 h-5" />
            Parked orders {parked.length > 0 && `(${parked.length})`}
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="shimmer h-20 rounded-lg" />
            ))}
          </div>
        ) : parked.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground text-sm">
            <ClipboardList className="w-12 h-12 mx-auto opacity-30 mb-3" />
            No parked orders
          </div>
        ) : (
          <div className="space-y-2">
            {parked.map((o: any) => {
              const elapsed = Math.floor(
                (Date.now() - new Date(o.createdAt).getTime()) / 60000
              );
              return (
                <div
                  key={o.id}
                  className="p-3 rounded-xl border border-border hover:border-primary/40 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap mb-0.5">
                        <span className="font-mono text-xs text-muted-foreground">
                          {o.orderNumber}
                        </span>
                        {o.table && (
                          <Badge variant="accent" className="text-[10px]">
                            Table {o.table.number}
                          </Badge>
                        )}
                        <Badge variant="default" className="text-[10px]">
                          {o.type === 'DINE_IN'
                            ? 'Dine-in'
                            : o.type === 'TAKEAWAY'
                            ? 'Takeaway'
                            : 'Delivery'}
                        </Badge>
                      </div>
                      {o.customer && (
                        <div className="text-xs font-medium truncate">
                          👤 {o.customer.name}
                        </div>
                      )}
                      <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                        <Clock className="w-3 h-3" />
                        {formatTime(o.createdAt)} ({elapsed} min ago) ·{' '}
                        {o.cashier?.name}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-bold text-accent tabular-nums">
                        {formatCurrency(o.total)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {o.items.length} items
                      </div>
                    </div>
                  </div>

                  <div className="text-xs text-muted-foreground truncate mb-2">
                    {o.items
                      .slice(0, 4)
                      .map((it: any) => `${it.quantity}× ${it.product.name}`)
                      .join(', ')}
                    {o.items.length > 4 && ` +${o.items.length - 4}`}
                  </div>

                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      className="flex-1"
                      onClick={() => recall(o)}
                      disabled={remove.isPending}
                    >
                      <ShoppingCart className="w-3.5 h-3.5 mr-1" /> Recall
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        if (confirm(`Delete order ${o.orderNumber}?`)) {
                          remove.mutate(o.id);
                        }
                      }}
                      disabled={remove.isPending}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
