'use client';
import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Printer } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { OrderSlip } from '@/components/pos/OrderSlip';

const AUTO_PRINT_KEY = 'pos-slip-autoprint';

/**
 * Preview + print the slip for an order that was just fired to the kitchen.
 * Opens straight after "ส่งครัว" so the cashier can hand the guest their copy
 * (and clip the kitchen copy to the pass) without leaving the POS screen.
 *
 * window.print() prints whichever copy is on screen — OrderSlip's print CSS
 * hides everything except #slip-printable, and only one copy is mounted.
 *
 * Auto-print: with the toggle on, sending a round fires the kitchen copy at the
 * printer by itself. How silent that is depends on the browser, not on us — no
 * page can bypass the print dialog. Launch the POS browser with
 * `--kiosk-printing` (Chrome/Edge) and window.print() goes straight to the
 * default printer with no dialog at all; without it, the dialog still opens on
 * its own and someone presses Enter. The toggle is remembered per device, since
 * which machine has the kitchen printer attached is a property of the counter.
 */
export function OrderSlipDialog({
  open,
  order,
  roundItemIds,
  onClose,
}: {
  open: boolean;
  order: any;
  /** OrderItem ids fired in this round — the kitchen copy prints only these. */
  roundItemIds?: string[];
  onClose: () => void;
}) {
  const t = useT();
  const [variant, setVariant] = useState<'customer' | 'kitchen'>('customer');
  const printRef = useRef<HTMLButtonElement>(null);
  const [autoPrint, setAutoPrint] = useState(false);
  const autoPrintedRef = useRef(false);
  const freshRound = !!roundItemIds?.length;

  // Remembered per device (localStorage), not per store: the printer is wired to
  // one machine at the counter, and a phone that opens the POS shouldn't inherit
  // its setting.
  useEffect(() => {
    try {
      setAutoPrint(localStorage.getItem(AUTO_PRINT_KEY) === '1');
    } catch {
      /* private mode — the toggle just stays off */
    }
  }, []);

  const toggleAutoPrint = (on: boolean) => {
    setAutoPrint(on);
    try {
      localStorage.setItem(AUTO_PRINT_KEY, on ? '1' : '0');
    } catch {
      /* ignore */
    }
  };

  const { data: store } = useQuery({
    queryKey: ['store-me'],
    queryFn: () => api.get('/stores/me').then((r) => r.data),
    staleTime: 5 * 60 * 1000,
    enabled: open,
  });

  // Fresh dialog every time — a new round shouldn't inherit the last copy shown.
  useEffect(() => {
    if (open) setVariant('customer');
  }, [open]);

  // Fire the kitchen copy on its own once per opening, and only for a round that
  // was just sent — a reprint is someone already standing at the printer, so it
  // must never start printing by itself. Waits for the store (the slip renders
  // nothing without it) and for the kitchen copy to actually be on screen,
  // because window.print() captures the DOM as it stands at that moment.
  useEffect(() => {
    if (!open) {
      autoPrintedRef.current = false;
      return;
    }
    if (!autoPrint || !freshRound || !store || autoPrintedRef.current) return;
    if (variant !== 'kitchen') {
      setVariant('kitchen');
      return;
    }
    autoPrintedRef.current = true;
    const id = window.setTimeout(() => window.print(), 150);
    return () => window.clearTimeout(id);
  }, [open, autoPrint, freshRound, store, variant]);

  if (!order) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="max-w-md max-h-[90vh] overflow-y-auto scrollbar-thin"
        // Land on Print, not on the copy switcher — a busy cashier can fire the
        // slip with Enter, and the focus ring never contradicts the active tab.
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          printRef.current?.focus();
        }}
      >
        <div className="space-y-3">
          <DialogHeader className="no-print">
            <DialogTitle className="flex items-center gap-2 text-lg">
              {/* No round = a reprint of the whole bill, so don't claim we just
                  sent anything to the kitchen. */}
              {freshRound ? (
                <>
                  <CheckCircle2 className="w-5 h-5 text-success shrink-0" />
                  {t('slip.sentTitle')}
                </>
              ) : (
                <>
                  <Printer className="w-5 h-5 text-muted-foreground shrink-0" />
                  {t('slip.title')}
                </>
              )}
              <span className="text-sm font-normal text-muted-foreground tabular-nums">
                {order.orderNumber}
              </span>
            </DialogTitle>
          </DialogHeader>

          {/* Copy switcher */}
          <div className="no-print grid grid-cols-2 gap-0.5 bg-muted rounded-lg p-1 text-sm">
            {(['customer', 'kitchen'] as const).map((v) => (
              <button
                key={v}
                onClick={() => setVariant(v)}
                className={`py-2 rounded-md transition-colors touch-manipulation ${
                  variant === v
                    ? 'bg-card text-foreground font-semibold shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {v === 'customer' ? t('slip.customerCopy') : t('slip.kitchenCopy')}
              </button>
            ))}
          </div>

          <p className="no-print text-[11px] text-muted-foreground">{t('slip.hint')}</p>

          <label className="no-print flex items-start gap-2 rounded-lg border border-border bg-muted/40 p-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={autoPrint}
              onChange={(e) => toggleAutoPrint(e.target.checked)}
              className="mt-0.5 w-4 h-4 accent-primary shrink-0"
            />
            <span className="text-xs leading-snug">
              <span className="font-medium">{t('slip.autoPrint')}</span>
              <span className="block text-[11px] text-muted-foreground">{t('slip.autoPrintHint')}</span>
            </span>
          </label>

          {/* print:* — the preview frame is screen chrome; it must not clip or
              outline the slip on paper */}
          <div className="rounded-lg overflow-hidden border border-border print:overflow-visible print:rounded-none print:border-0">
            <OrderSlip order={order} store={store} variant={variant} roundItemIds={roundItemIds} />
          </div>

          <div className="flex gap-2 no-print sticky bottom-0 bg-card pt-2">
            <Button variant="outline" className="flex-1" onClick={onClose}>
              {t('slip.close')}
            </Button>
            <Button ref={printRef} className="flex-1" disabled={!store} onClick={() => window.print()}>
              <Printer className="w-4 h-4 mr-1.5" />
              {variant === 'kitchen' ? t('slip.printKitchen') : t('slip.printCustomer')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
