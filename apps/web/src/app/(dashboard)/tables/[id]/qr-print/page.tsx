'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import QRCode from 'qrcode';
import { ArrowLeft, Printer, UtensilsCrossed, Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import { api } from '@/lib/api';
import { resolveImageUrl } from '@/lib/imageUrl';
import { Button } from '@/components/ui/button';
import { useT } from '@/lib/i18n';

/**
 * A dedicated full page (not a dialog) so the app's existing print
 * stylesheet (globals.css `@media print` — hides aside/header, flattens
 * dark theme to print-friendly black/white) applies cleanly, same pattern
 * as the receipt page. The toolbar is `.no-print` so only the card itself
 * ends up on paper.
 */
export default function TableQrPrintPage() {
  const t = useT();
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [qrDataUrl, setQrDataUrl] = useState('');

  const { data: tableQr, isError: qrError, error: qrErrorObj, refetch: refetchQr } = useQuery({
    queryKey: ['table-qr', id],
    queryFn: () => api.get(`/tables/${id}/qr`).then((r) => r.data),
    retry: false,
  });

  const { data: store, isError: storeError } = useQuery({
    queryKey: ['store-me'],
    queryFn: () => api.get('/stores/me').then((r) => r.data),
    retry: false,
  });

  useEffect(() => {
    if (!tableQr?.qrCode) return;
    const url = `${window.location.origin}/order/${tableQr.qrCode}`;
    QRCode.toDataURL(url, { width: 480, margin: 1 })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(''));
  }, [tableQr]);

  if (qrError || storeError) {
    const message = (qrErrorObj as any)?.response?.data?.error || (qrErrorObj as any)?.message;
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-background text-center p-6">
        <AlertCircle className="w-8 h-8 text-danger" />
        <p className="text-danger text-sm">{t('tableQr.loadFailed')}</p>
        {message && <p className="text-xs text-muted-foreground">{message}</p>}
        <Button size="sm" variant="outline" onClick={() => refetchQr()}>
          <RefreshCw className="w-3.5 h-3.5 mr-1" /> {t('tableQr.retry')}
        </Button>
      </div>
    );
  }

  if (!tableQr || !store || !qrDataUrl) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-muted-foreground">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="no-print bg-card border-b border-border p-4 sticky top-0 z-10">
        <div className="max-w-md mx-auto flex items-center justify-between">
          <Button variant="outline" size="sm" onClick={() => router.back()}>
            <ArrowLeft className="w-4 h-4 mr-1" /> {t('orders.back')}
          </Button>
          <Button size="sm" onClick={() => window.print()}>
            <Printer className="w-4 h-4 mr-1" /> {t('tableQr.print')}
          </Button>
        </div>
      </div>

      <div className="flex items-center justify-center p-8 print:p-0 print:min-h-0">
        <div className="w-full max-w-sm border-2 border-dashed border-border rounded-3xl p-8 flex flex-col items-center text-center">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-3 overflow-hidden">
            {store.logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={resolveImageUrl(store.logo)} alt="" className="w-full h-full object-cover" />
            ) : (
              <UtensilsCrossed className="w-7 h-7 text-primary" />
            )}
          </div>
          <div className="font-bold text-lg mb-3">{store.name}</div>
          <div className="inline-block px-4 py-1.5 rounded-full bg-primary text-primary-foreground font-bold text-xl tabular-nums mb-6">
            {t('cart.tableWord')} {tableQr.number}
          </div>

          <div className="bg-white rounded-2xl p-4 shadow-card mb-6">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrDataUrl} alt="QR" className="w-64 h-64" />
          </div>

          <div className="font-semibold mb-1.5">{t('tableQr.scanHeading')}</div>
          <p className="text-sm text-muted-foreground max-w-[240px]">{t('tableQr.printHint')}</p>
        </div>
      </div>
    </div>
  );
}
