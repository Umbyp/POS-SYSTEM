'use client';
import { useEffect, useState } from 'react';
import { Ban } from 'lucide-react';
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

interface Props {
  item: { id: string; name: string; maxQty: number } | null;
  onClose: () => void;
  onConfirm: (qty: number, reason: string) => void;
  loading?: boolean;
}

/** Void some/all of an already-fired item — requires a reason for accountability. */
export function VoidItemDialog({ item, onClose, onConfirm, loading }: Props) {
  const t = useT();
  const [qty, setQty] = useState(1);
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (item) {
      setQty(item.maxQty);
      setReason('');
    }
  }, [item?.id]);

  if (!item) return null;

  return (
    <Dialog open={!!item} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Ban className="w-4 h-4 text-danger" />
            {t('void.title')}
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">{item.name}</p>

        <div>
          <Label className="mb-1.5 block">{t('void.qty')}</Label>
          <Input
            type="number"
            min={1}
            max={item.maxQty}
            value={qty}
            onChange={(e) => setQty(Math.min(item.maxQty, Math.max(1, parseInt(e.target.value) || 1)))}
          />
          <div className="text-xs text-muted-foreground mt-1">
            {t('void.maxHint')} {item.maxQty}
          </div>
        </div>

        <div>
          <Label className="mb-1.5 block">{t('void.reason')}</Label>
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t('void.reasonPlaceholder')}
            autoFocus
          />
        </div>

        <div className="flex gap-2 pt-2">
          <Button type="button" variant="outline" className="flex-1" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="danger"
            className="flex-1"
            disabled={!reason.trim() || loading}
            onClick={() => onConfirm(qty, reason.trim())}
          >
            {t('void.confirm')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
