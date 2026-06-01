'use client';
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { formatCurrency, formatDate } from '@/lib/format';
import { generatePromptPayPayload } from '@/lib/promptpay';

interface Props {
  order: any;
  store: any;
  /** 'thermal' = 80mm thermal printer · 'a4' = full page */
  format?: 'thermal' | 'a4';
  /** 'abbreviated' = short tax invoice · 'full' = full tax invoice */
  invoiceType?: 'abbreviated' | 'full';
}

const PAYMENT_LABEL: Record<string, string> = {
  CASH: '💵 Cash',
  PROMPTPAY: '📱 PromptPay',
  CREDIT_CARD: '💳 Credit Card',
  BANK_TRANSFER: '🏦 Bank Transfer',
};

const TYPE_LABEL: Record<string, string> = {
  DINE_IN: 'Dine-in',
  TAKEAWAY: 'Takeaway',
  DELIVERY: 'Delivery',
};

export function Receipt({ order, store, format = 'thermal', invoiceType = 'abbreviated' }: Props) {
  const [qrUrl, setQrUrl] = useState<string>('');

  useEffect(() => {
    const ppPayment = order?.payments?.find((p: any) => p.method === 'PROMPTPAY');
    if (ppPayment && store?.promptpayId) {
      try {
        const payload = generatePromptPayPayload({
          promptpayId: store.promptpayId,
          amount: Number(ppPayment.amount),
        });
        QRCode.toDataURL(payload, { width: 140, margin: 0 }).then(setQrUrl);
      } catch { /* ignore */ }
    }
  }, [order, store]);

  if (!order || !store) return null;

  const isThermal = format === 'thermal';
  const isFullInvoice = invoiceType === 'full';

  return (
    <>
      <style jsx global>{`
        @media print {
          @page {
            size: ${isThermal ? '80mm auto' : 'A4'};
            margin: ${isThermal ? '0' : '12mm'};
          }
          body * { visibility: hidden; }
          #receipt-printable, #receipt-printable * { visibility: visible; }
          #receipt-printable {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
          }
          .no-print { display: none !important; }
        }
        #receipt-printable {
          font-family: 'IBM Plex Sans Thai', 'Sarabun', system-ui, sans-serif;
          color: #111;
          background: #fff;
          font-feature-settings: 'tnum' on;
        }
        #receipt-printable .divider-dashed {
          border-top: 1px dashed #999;
        }
        #receipt-printable .divider-solid {
          border-top: 2px solid #111;
        }
      `}</style>

      <div
        id="receipt-printable"
        className={isThermal ? 'mx-auto bg-white' : 'mx-auto bg-white shadow-sm'}
        style={{
          width: isThermal ? '80mm' : '210mm',
          minHeight: isThermal ? 'auto' : '297mm',
          fontSize: isThermal ? '12px' : '13px',
          padding: isThermal ? '8px 10px' : '24px 28px',
          lineHeight: 1.45,
        }}
      >
        {/* ==================== HEADER ==================== */}
        <div className="text-center">
          {store.logo && (
            <img
              src={store.logo}
              alt="logo"
              className="mx-auto mb-1.5"
              style={{ maxHeight: isThermal ? '48px' : '72px' }}
            />
          )}
          <div
            style={{
              fontSize: isThermal ? '16px' : '24px',
              fontWeight: 800,
              letterSpacing: '0.02em',
              lineHeight: 1.2,
            }}
          >
            {store.name}
          </div>
          {store.address && (
            <div style={{ fontSize: isThermal ? '10px' : '11px', color: '#555', marginTop: 2 }}>
              {store.address}
            </div>
          )}
          <div
            style={{ fontSize: isThermal ? '10px' : '11px', color: '#555' }}
            className="flex flex-wrap justify-center gap-x-2"
          >
            {store.phone && <span>☎ {store.phone}</span>}
            {store.taxId && (
              <span>
                TAX ID {store.taxId}
                {store.branchCode && ` (${store.branchCode})`}
              </span>
            )}
          </div>
        </div>

        {/* ==================== INVOICE TYPE BADGE ==================== */}
        <div className="text-center my-2">
          <div
            style={{
              display: 'inline-block',
              border: '1.5px solid #111',
              padding: isThermal ? '2px 10px' : '4px 16px',
              fontWeight: 700,
              fontSize: isThermal ? '11px' : '13px',
              letterSpacing: '0.05em',
              borderRadius: 4,
            }}
          >
            {isFullInvoice ? 'TAX INVOICE' : 'ABB. TAX INVOICE'}
          </div>
        </div>

        {/* ==================== ORDER META ==================== */}
        <div
          className={isThermal ? 'space-y-0.5' : 'grid grid-cols-2 gap-x-6 gap-y-1'}
          style={{ fontSize: isThermal ? '11px' : '12px' }}
        >
          <Meta label="No." value={order.orderNumber} bold />
          <Meta label="Date" value={formatDate(order.createdAt)} />
          {order.cashier && <Meta label="Cashier" value={order.cashier.name} />}
          {order.table && <Meta label="Table" value={order.table.number} />}
          {order.type && <Meta label="Type" value={TYPE_LABEL[order.type] || order.type} />}
          {order.customer && (
            <Meta label="Customer" value={order.customer.name} bold />
          )}
        </div>

        {/* Customer info (full invoice) */}
        {isFullInvoice && (
          <div
            className="mt-2 p-2 rounded"
            style={{
              backgroundColor: '#f8f8f8',
              border: '1px solid #e5e5e5',
              fontSize: isThermal ? '11px' : '12px',
            }}
          >
            <div className="font-semibold mb-0.5">Customer information</div>
            <div>{order.customerName || '-'}</div>
            {order.customerTaxId && (
              <div className="text-[11px]">Tax ID: {order.customerTaxId}</div>
            )}
            {order.customerAddress && (
              <div className="text-[10px] mt-0.5">{order.customerAddress}</div>
            )}
          </div>
        )}

        <div className="divider-dashed my-2" />

        {/* ==================== ITEMS ==================== */}
        {isThermal ? (
          <div className="space-y-1.5">
            {order.items.map((item: any) => {
              const lineTotal = Number(item.unitPrice) * item.quantity;
              return (
                <div key={item.id}>
                  <div className="flex justify-between gap-2">
                    <div className="flex-1 break-words" style={{ fontWeight: 500 }}>
                      {item.product.name}
                    </div>
                    <div className="tabular-nums shrink-0">{lineTotal.toFixed(2)}</div>
                  </div>
                  <div style={{ fontSize: '10px', color: '#666' }}>
                    {item.quantity} × {Number(item.unitPrice).toFixed(2)}
                    {Number(item.discount) > 0 && ` − Discount ${Number(item.discount).toFixed(2)}`}
                  </div>
                  {item.notes && (
                    <div style={{ fontSize: '10px', color: '#777', fontStyle: 'italic', paddingLeft: 6 }}>
                      ↪ {item.notes}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <table className="w-full" style={{ fontSize: 12, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: '#f0f0f0' }}>
                <th className="text-left py-2 px-2" style={{ width: 36 }}>#</th>
                <th className="text-left py-2 px-2">Item</th>
                <th className="text-center py-2 px-2" style={{ width: 60 }}>Qty</th>
                <th className="text-right py-2 px-2" style={{ width: 80 }}>Price</th>
                <th className="text-right py-2 px-2" style={{ width: 90 }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {order.items.map((item: any, idx: number) => (
                <tr
                  key={item.id}
                  style={{
                    borderBottom: '1px solid #eee',
                    backgroundColor: idx % 2 === 1 ? '#fafafa' : 'transparent',
                  }}
                >
                  <td className="py-1.5 px-2 text-gray-500">{idx + 1}</td>
                  <td className="py-1.5 px-2">
                    <div style={{ fontWeight: 500 }}>{item.product.name}</div>
                    {item.notes && (
                      <div className="text-xs text-gray-600 italic">↪ {item.notes}</div>
                    )}
                  </td>
                  <td className="text-center py-1.5 px-2 tabular-nums">{item.quantity}</td>
                  <td className="text-right py-1.5 px-2 tabular-nums">
                    {Number(item.unitPrice).toFixed(2)}
                  </td>
                  <td className="text-right py-1.5 px-2 tabular-nums font-medium">
                    {(Number(item.unitPrice) * item.quantity).toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div className="divider-dashed my-2" />

        {/* ==================== TOTALS ==================== */}
        <div className="space-y-1" style={{ fontSize: isThermal ? '12px' : '13px' }}>
          <Row label="Subtotal" value={formatCurrency(order.subtotal)} muted />
          {Number(order.discount) > 0 && (
            <Row
              label={
                order.pointsRedeemed > 0
                  ? `Discount (incl. ${order.pointsRedeemed} pts)`
                  : 'Discount'
              }
              value={`-${formatCurrency(order.discount)}`}
              muted
            />
          )}
          {Number(order.serviceCharge) > 0 && (
            <Row label="Service charge" value={formatCurrency(order.serviceCharge)} muted />
          )}
          {Number(order.tax) > 0 && (
            <Row
              label={
                store.priceIncludesTax
                  ? `VAT ${store.taxRate}% (incl.)`
                  : `VAT ${store.taxRate}%`
              }
              value={formatCurrency(order.tax)}
              tiny
            />
          )}

          {/* Grand total — highlighted */}
          <div
            className="flex items-center justify-between mt-1.5"
            style={{
              borderTop: '2px solid #111',
              borderBottom: '2px solid #111',
              padding: '6px 0',
              marginTop: 6,
            }}
          >
            <span style={{ fontWeight: 700, fontSize: isThermal ? '13px' : '15px' }}>
              Total
            </span>
            <span
              className="tabular-nums"
              style={{ fontWeight: 800, fontSize: isThermal ? '16px' : '20px' }}
            >
              {formatCurrency(order.total)}
            </span>
          </div>
        </div>

        {/* ==================== PAYMENTS ==================== */}
        <div className="mt-3 space-y-0.5" style={{ fontSize: isThermal ? '11px' : '12px' }}>
          <div className="font-semibold text-gray-700 mb-1">Payment</div>
          {order.payments.map((p: any) => (
            <div key={p.id}>
              <Row label={PAYMENT_LABEL[p.method] || p.method} value={formatCurrency(p.amount)} />
              {p.slipVerified ? (
                <div
                  style={{ fontSize: '10px', color: '#0a7a23', paddingLeft: 8, fontWeight: 600 }}
                >
                  ✓ Slip verified
                  {p.slipTransRef && (
                    <span style={{ fontFamily: 'monospace', marginLeft: 4 }}>
                      ({p.slipTransRef.slice(-8)})
                    </span>
                  )}
                </div>
              ) : p.reference?.startsWith('pi_') ? (
                <div style={{ fontSize: '10px', color: '#0a7a23', paddingLeft: 8, fontWeight: 600 }}>
                  ✓ Paid via PromptPay
                </div>
              ) : p.reference ? (
                <div style={{ fontSize: '10px', color: '#777', paddingLeft: 8 }}>
                  Ref: {p.reference}
                </div>
              ) : null}
            </div>
          ))}
          {(() => {
            const paid = order.payments.reduce((s: number, p: any) => s + Number(p.amount), 0);
            const change = paid - Number(order.total);
            if (change > 0.01) {
              return (
                <Row label="Change" value={formatCurrency(change)} highlight />
              );
            }
            return null;
          })()}
        </div>

        {/* ==================== QR (PromptPay verification) ==================== */}
        {qrUrl && (
          <div
            className="text-center mt-3 p-2 rounded"
            style={{ border: '1px solid #ddd', backgroundColor: '#fafafa' }}
          >
            <div style={{ fontSize: 10, color: '#666', marginBottom: 4 }}>
              Payment QR proof
            </div>
            <img src={qrUrl} alt="payment qr" className="mx-auto" />
          </div>
        )}

        <div className="divider-dashed my-3" />

        {/* ==================== LOYALTY ==================== */}
        {order.customer && (order.pointsEarned > 0 || order.pointsRedeemed > 0) && (
          <div
            className="mt-3 p-2 rounded text-center"
            style={{
              border: '1px dashed #999',
              backgroundColor: '#fff8e1',
              fontSize: isThermal ? '10.5px' : '12px',
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: 2 }}>
              Member: {order.customer.name}
            </div>
            {order.pointsRedeemed > 0 && (
              <div>Redeemed {order.pointsRedeemed} pts</div>
            )}
            {order.pointsEarned > 0 && (
              <div style={{ color: '#0a7a23' }}>
                ✨ Earned +{order.pointsEarned} pts
              </div>
            )}
          </div>
        )}

        {/* ==================== FOOTER ==================== */}
        <div className="text-center" style={{ fontSize: isThermal ? '10px' : '11px', color: '#555' }}>
          <div style={{ fontWeight: 600, fontSize: isThermal ? '11px' : '12px', color: '#111' }}>
            Thank you 🙏
          </div>
          <div style={{ marginTop: 2 }}>Thank you for your purchase</div>
          {isFullInvoice && (
            <div style={{ marginTop: 4, fontSize: 9, color: '#888' }}>
              This document is issued by computer
            </div>
          )}
          <div style={{ marginTop: 6, fontSize: 9, color: '#aaa' }}>
            Powered by POS System · {new Date().getFullYear()}
          </div>
        </div>
      </div>
    </>
  );
}

// Helper components
function Meta({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div>
      <span style={{ color: '#666' }}>{label}: </span>
      <span style={{ fontWeight: bold ? 700 : 500 }}>{value}</span>
    </div>
  );
}

function Row({
  label,
  value,
  muted,
  tiny,
  highlight,
}: {
  label: string;
  value: string;
  muted?: boolean;
  tiny?: boolean;
  highlight?: boolean;
}) {
  return (
    <div
      className="flex justify-between gap-2"
      style={{
        color: muted ? '#555' : highlight ? '#0a7a23' : '#111',
        fontSize: tiny ? '10.5px' : undefined,
        fontWeight: highlight ? 700 : undefined,
      }}
    >
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
