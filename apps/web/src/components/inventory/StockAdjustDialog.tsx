'use client';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Loader2,
  PackagePlus,
  Trash,
  ClipboardCheck,
  TrendingDown,
} from 'lucide-react';
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
import { Badge } from '@/components/ui/badge';

type Mode = 'PURCHASE' | 'WASTE' | 'COUNT';

interface Props {
  open: boolean;
  onClose: () => void;
  item: any; // inventory item with product
}

const MODES: { key: Mode; label: string; icon: any; color: string; desc: string }[] = [
  {
    key: 'PURCHASE',
    label: 'Receive',
    icon: PackagePlus,
    color: 'border-success text-success bg-success/10',
    desc: 'Receive new stock from supplier',
  },
  {
    key: 'WASTE',
    label: 'Waste/Loss',
    icon: TrendingDown,
    color: 'border-warning text-warning bg-warning/10',
    desc: 'Lost / expired / damaged',
  },
  {
    key: 'COUNT',
    label: 'Stock count',
    icon: ClipboardCheck,
    color: 'border-primary text-primary bg-primary/10',
    desc: 'Physical count, set new quantity',
  },
];

export function StockAdjustDialog({ open, onClose, item }: Props) {
  const qc = useQueryClient();
  const [mode, setMode] = useState<Mode>('PURCHASE');
  const [qty, setQty] = useState('');
  const [reason, setReason] = useState('');

  const adjust = useMutation({
    mutationFn: async (payload: any) => {
      if (mode === 'COUNT') {
        return api
          .post(`/inventory/${item.product.id}/set`, payload)
          .then((r) => r.data);
      }
      return api.post(`/inventory/${item.product.id}/adjust`, payload).then((r) => r.data);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inventory'] });
      qc.invalidateQueries({ queryKey: ['inventory-movements'] });
      toast.success('Stock adjustment saved');
      setQty('');
      setReason('');
      onClose();
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Stock adjustment failed'),
  });

  const handleSubmit = () => {
    const num = parseInt(qty);
    if (isNaN(num) || num < 0) {
      toast.error('Please enter a valid quantity');
      return;
    }
    if (!reason.trim()) {
      toast.error('Please provide a reason');
      return;
    }
    if (mode === 'COUNT') {
      adjust.mutate({ quantity: num, reason });
    } else if (mode === 'PURCHASE') {
      adjust.mutate({ quantity: num, reason, type: 'PURCHASE' });
    } else {
      // WASTE - negative
      if (num > item.quantity) {
        toast.error(`Cannot reduce more than ${item.quantity}`);
        return;
      }
      adjust.mutate({ quantity: -num, reason, type: 'WASTE' });
    }
  };

  // Calculate preview result
  const num = parseInt(qty) || 0;
  const newQty =
    mode === 'COUNT'
      ? num
      : mode === 'PURCHASE'
      ? item.quantity + num
      : item.quantity - num;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Adjust stock: {item?.product?.name}</DialogTitle>
        </DialogHeader>

        <div className="flex items-center justify-between p-3 rounded-xl bg-muted">
          <div>
            <div className="text-xs text-muted-foreground">Current stock</div>
            <div className="text-2xl font-bold tabular-nums">{item?.quantity}</div>
          </div>
          {item?.product?.isIngredient && (
            <Badge variant="warning">Ingredient</Badge>
          )}
        </div>

        {/* Mode select */}
        <div>
          <Label className="mb-2 block">Adjustment type</Label>
          <div className="grid grid-cols-3 gap-2">
            {MODES.map((m) => {
              const Icon = m.icon;
              const active = mode === m.key;
              return (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => setMode(m.key)}
                  className={`p-3 rounded-xl border-2 transition-all flex flex-col items-center gap-1 ${
                    active ? m.color : 'border-border hover:border-muted-foreground'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  <span className="text-xs font-medium">{m.label}</span>
                </button>
              );
            })}
          </div>
          <p className="text-[10px] text-muted-foreground mt-1.5">
            {MODES.find((m) => m.key === mode)?.desc}
          </p>
        </div>

        {/* Quantity input */}
        <div>
          <Label className="mb-1.5 block">
            {mode === 'COUNT' ? 'Counted quantity (new total)' : 'Quantity'}
          </Label>
          <Input
            type="number"
            min="0"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            placeholder="0"
            className="text-2xl h-14 text-right tabular-nums"
            autoFocus
          />

          {/* Preview */}
          {qty && (
            <div
              className={`mt-2 p-2.5 rounded-lg text-sm flex items-center justify-between ${
                newQty < 0
                  ? 'bg-danger/10 text-danger'
                  : 'bg-success/10 text-success'
              }`}
            >
              <span>After:</span>
              <span className="font-bold tabular-nums">
                {item?.quantity} →{' '}
                <span
                  className={
                    newQty > item?.quantity
                      ? 'text-success'
                      : newQty < item?.quantity
                      ? 'text-warning'
                      : ''
                  }
                >
                  {newQty}
                </span>
                <span className="text-xs ml-2 text-muted-foreground">
                  ({newQty - item?.quantity >= 0 ? '+' : ''}
                  {newQty - item?.quantity})
                </span>
              </span>
            </div>
          )}
        </div>

        {/* Reason */}
        <div>
          <Label className="mb-1.5 block">Reason *</Label>
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={
              mode === 'PURCHASE'
                ? 'e.g. received from supplier XX on...'
                : mode === 'WASTE'
                ? 'e.g. expired, broken, pest damage'
                : 'e.g. monthly stock count'
            }
            required
          />
        </div>

        <div className="flex gap-2 pt-1">
          <Button variant="outline" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button
            className="flex-1"
            onClick={handleSubmit}
            disabled={adjust.isPending || !qty || !reason.trim()}
          >
            {adjust.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              'Save'
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
