'use client';
import { useQuery } from '@tanstack/react-query';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Printer, Download, ArrowLeft, FileText } from 'lucide-react';
import { api } from '@/lib/api';
import { Receipt } from '@/components/pos/Receipt';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export default function ReceiptPage() {
  const { id } = useParams<{ id: string }>();
  const sp = useSearchParams();
  const router = useRouter();

  const initialFormat = (sp.get('format') as 'thermal' | 'a4') || 'thermal';
  const initialType = (sp.get('type') as 'abbreviated' | 'full') || 'abbreviated';

  const [format, setFormat] = useState<'thermal' | 'a4'>(initialFormat);
  const [invoiceType, setInvoiceType] = useState<'abbreviated' | 'full'>(initialType);
  const [autoPrint, setAutoPrint] = useState(sp.get('autoprint') === '1');

  const { data: order, isLoading } = useQuery({
    queryKey: ['order', id],
    queryFn: () => api.get(`/orders/${id}`).then((r) => r.data),
  });

  const { data: store } = useQuery({
    queryKey: ['store-me'],
    queryFn: () => api.get('/stores/me').then((r) => r.data),
  });

  // Auto-print when arriving from ?autoprint=1
  useEffect(() => {
    if (autoPrint && order && store) {
      setTimeout(() => window.print(), 500);
      setAutoPrint(false);
    }
  }, [autoPrint, order, store]);

  if (isLoading || !order || !store) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Toolbar (no-print) */}
      <div className="no-print bg-card border-b border-border p-4 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => router.back()}>
              <ArrowLeft className="w-4 h-4 mr-1" /> Back
            </Button>
            <Badge variant="accent">#{order.orderNumber}</Badge>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Format toggle */}
            <div className="flex bg-muted rounded-lg p-1">
              <button
                onClick={() => setFormat('thermal')}
                className={`px-3 py-1 text-xs rounded ${
                  format === 'thermal' ? 'bg-primary text-white' : 'text-muted-foreground'
                }`}
              >
                80mm receipt
              </button>
              <button
                onClick={() => setFormat('a4')}
                className={`px-3 py-1 text-xs rounded ${
                  format === 'a4' ? 'bg-primary text-white' : 'text-muted-foreground'
                }`}
              >
                A4
              </button>
            </div>

            {/* Invoice type */}
            <div className="flex bg-muted rounded-lg p-1">
              <button
                onClick={() => setInvoiceType('abbreviated')}
                className={`px-3 py-1 text-xs rounded ${
                  invoiceType === 'abbreviated' ? 'bg-primary text-white' : 'text-muted-foreground'
                }`}
              >
                Abbreviated
              </button>
              <button
                onClick={() => setInvoiceType('full')}
                className={`px-3 py-1 text-xs rounded ${
                  invoiceType === 'full' ? 'bg-primary text-white' : 'text-muted-foreground'
                }`}
              >
                Full
              </button>
            </div>

            <Button size="sm" onClick={() => window.print()}>
              <Printer className="w-4 h-4 mr-1" /> Print
            </Button>
            <Button size="sm" variant="outline" onClick={() => window.print()}>
              <Download className="w-4 h-4 mr-1" /> Save PDF
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                // Direct print to network thermal printer via backend endpoint
                try {
                  const r = await api.post(`/orders/${id}/print/escpos`);
                  alert(r.data.message || 'Sent to printer');
                } catch (e: any) {
                  alert(e.response?.data?.error || 'Print failed — set PRINTER_IP in backend');
                }
              }}
              title="Send ESC/POS to network printer (requires PRINTER_IP set in backend)"
            >
              <FileText className="w-4 h-4 mr-1" /> Thermal
            </Button>
          </div>
        </div>
      </div>

      {/* Receipt preview (scaled box) */}
      <div className="p-6 flex justify-center">
        <div
          className="bg-white shadow-xl"
          style={{
            transform: format === 'thermal' ? 'scale(1.4)' : 'scale(0.8)',
            transformOrigin: 'top center',
            margin: format === 'thermal' ? '0 0 200px 0' : '0',
          }}
        >
          <Receipt order={order} store={store} format={format} invoiceType={invoiceType} />
        </div>
      </div>
    </div>
  );
}
