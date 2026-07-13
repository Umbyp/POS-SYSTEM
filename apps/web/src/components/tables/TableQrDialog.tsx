'use client';
import { useEffect, useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import QRCode from 'qrcode';
import { Loader2, Copy, RefreshCw, Printer } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface Props {
  table: { id: string; number: string } | null;
  onClose: () => void;
}

/** Lazily fetches (or generates) the table's opaque QR token and renders it
 * client-side, same pattern as PromptPayQR — the link opens /order/[code]. */
export function TableQrDialog({ table, onClose }: Props) {
  const t = useT();
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [link, setLink] = useState('');

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['table-qr', table?.id],
    queryFn: () => api.get(`/tables/${table!.id}/qr`).then((r) => r.data),
    enabled: !!table,
  });

  useEffect(() => {
    if (!data?.qrCode) return;
    const url = `${window.location.origin}/order/${data.qrCode}`;
    setLink(url);
    QRCode.toDataURL(url, { width: 280, margin: 1 })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(''));
  }, [data]);

  const regenerate = useMutation({
    mutationFn: () => api.post(`/tables/${table!.id}/qr/regenerate`).then((r) => r.data),
    onSuccess: () => {
      toast.success(t('tableQr.regenerated'));
      refetch();
    },
    onError: () => toast.error(t('tableQr.loadFailed')),
  });

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(link);
      toast.success(t('tableQr.linkCopied'));
    } catch {
      /* clipboard unavailable — user can still see/select the link visually if needed */
    }
  };

  if (!table) return null;

  return (
    <Dialog open={!!table} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {t('tableQr.title')} — {t('cart.tableWord')} {table.number}
          </DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">{t('tableQr.hint')}</p>

        <div className="flex flex-col items-center py-2">
          {isLoading || !qrDataUrl ? (
            <div className="w-56 h-56 flex items-center justify-center bg-muted rounded-xl">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qrDataUrl} alt="QR" className="w-56 h-56 rounded-xl border border-border bg-white p-2" />
          )}
        </div>

        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={copyLink} disabled={!link}>
            <Copy className="w-4 h-4 mr-1" /> {t('tableQr.copyLink')}
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => regenerate.mutate()}
            disabled={regenerate.isPending}
            title={t('tableQr.regenerate')}
          >
            {regenerate.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          </Button>
        </div>
        <Button
          className="w-full"
          onClick={() => window.open(`/tables/${table.id}/qr-print`, '_blank')}
          disabled={!link}
        >
          <Printer className="w-4 h-4 mr-1" /> {t('tableQr.print')}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
