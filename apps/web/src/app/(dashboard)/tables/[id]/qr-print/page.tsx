'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import QRCode from 'qrcode';
import { ArrowLeft, Printer, UtensilsCrossed, Loader2, AlertCircle, RefreshCw, Check, Phone, ScanLine } from 'lucide-react';
import { api } from '@/lib/api';
import { resolveImageUrl } from '@/lib/imageUrl';
import { Button } from '@/components/ui/button';
import { useT, both } from '@/lib/i18n';

/**
 * A dedicated full page (not a dialog) so the app's existing print
 * stylesheet (globals.css `@media print` — hides aside/header, flattens
 * dark theme to print-friendly black/white) applies cleanly, same pattern
 * as the receipt page. The toolbar is `.no-print` so only the card itself
 * ends up on paper.
 *
 * Print-safety note: browsers do NOT print background-color by default, so
 * the card leans on colored *text* and *outlines* (which always print) and
 * carries `print-color-adjust: exact` to opt the few tinted fills in too.
 * Nothing critical (table number, steps) relies on a filled background.
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
    // High error-correction + generous size keeps it scannable even if the
    // printed card gets a little worn, folded, or laminated.
    QRCode.toDataURL(url, { width: 640, margin: 1, errorCorrectionLevel: 'H' })
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

  const steps = ['tableQr.step1', 'tableQr.step2', 'tableQr.step3'];

  return (
    <div className="min-h-screen bg-background">
      {/* Toolbar — screen only */}
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

      <div className="flex items-center justify-center p-6 sm:p-10 print:p-0 print:min-h-0">
        {/* The card. print-color-adjust:exact lets the tint accents print too. */}
        <div
          className="w-full max-w-sm bg-card border border-border rounded-[28px] overflow-hidden shadow-card print:shadow-none"
          style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' } as React.CSSProperties}
        >
          {/* Accent top rule (border prints reliably) */}
          <div className="h-1.5 bg-primary print:hidden" />
          <div className="hidden print:block border-t-[3px] border-primary" />

          <div className="px-8 pt-7 pb-8 flex flex-col items-center text-center">
            {/* Store identity */}
            <div className="w-16 h-16 rounded-2xl border-2 border-primary/30 flex items-center justify-center overflow-hidden">
              {store.logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={resolveImageUrl(store.logo)} alt="" className="w-full h-full object-cover" />
              ) : (
                <UtensilsCrossed className="w-8 h-8 text-primary" />
              )}
            </div>
            <div className="mt-3 font-bold text-xl leading-tight">{store.name}</div>
            <div className="mt-1 text-xs text-muted-foreground">
              <span>{both('tableQr.cardTagline').th}</span>
              <span className="mx-1 opacity-40">·</span>
              <span className="italic">{both('tableQr.cardTagline').en}</span>
            </div>

            {/* Table number — outlined so it survives black & white printing */}
            <div className="mt-5 inline-flex items-baseline gap-2 rounded-2xl border-2 border-primary px-5 py-2">
              <span className="text-sm font-medium text-primary/80 uppercase tracking-wide">
                {both('tableQr.tableLabel').th} / {both('tableQr.tableLabel').en}
              </span>
              <span className="text-3xl font-extrabold text-primary tabular-nums leading-none">
                {tableQr.number}
              </span>
            </div>

            {/* Scan heading */}
            <div className="mt-6 flex items-center gap-2 text-primary">
              <ScanLine className="w-5 h-5" />
              <span className="font-bold text-lg">{both('tableQr.scanHeading').th}</span>
            </div>
            <div className="text-sm text-muted-foreground italic">{both('tableQr.scanHeading').en}</div>

            {/* QR */}
            <div className="mt-4 rounded-2xl border-2 border-border bg-white p-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qrDataUrl} alt="QR" className="w-56 h-56" />
            </div>

            {/* Steps 1-2-3 */}
            <div className="mt-6 w-full space-y-3 text-left">
              {steps.map((key, i) => (
                <div key={key} className="flex items-start gap-3">
                  <span className="shrink-0 w-6 h-6 rounded-full border-2 border-primary text-primary text-xs font-bold flex items-center justify-center tabular-nums">
                    {i + 1}
                  </span>
                  <div className="leading-snug">
                    <div className="text-sm font-medium">{both(key).th}</div>
                    <div className="text-xs text-muted-foreground italic">{both(key).en}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Reassurance */}
            <div className="mt-5 w-full flex items-start gap-2 rounded-xl border border-primary/25 px-3 py-2 text-left">
              <Check className="w-4 h-4 text-primary shrink-0 mt-0.5" />
              <div className="leading-snug">
                <div className="text-xs font-medium">{both('tableQr.needHelp').th}</div>
                <div className="text-[11px] text-muted-foreground italic">{both('tableQr.needHelp').en}</div>
              </div>
            </div>

            {/* Footer: contact + no-app note */}
            <div className="mt-5 pt-4 w-full border-t border-border flex items-center justify-center gap-x-4 gap-y-1 flex-wrap text-[11px] text-muted-foreground">
              {store.phone && (
                <span className="inline-flex items-center gap-1">
                  <Phone className="w-3 h-3" /> {store.phone}
                </span>
              )}
              <span className="inline-flex items-center gap-1">
                <ScanLine className="w-3 h-3" /> {both('tableQr.noApp').th} · {both('tableQr.noApp').en}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
