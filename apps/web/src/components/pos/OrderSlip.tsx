'use client';
import { formatCurrency, formatDate, formatTime } from '@/lib/format';

/**
 * 80mm thermal slip for an order that has been fired to the kitchen but not
 * paid yet — the piece of paper a restaurant hands over (or clips to the pass)
 * the moment the order goes in. Deliberately *not* the Receipt component:
 *
 *   customer → "ใบรายการอาหาร" — prices + running total, stamped as unpaid so
 *              it can never be mistaken for the abbreviated tax invoice that
 *              Receipt.tsx prints after payment.
 *   kitchen  → big item names, quantities and notes, no prices at all.
 *
 * Print styles are scoped to #slip-printable (Receipt.tsx owns
 * #receipt-printable) so the two never fight over the print viewport.
 */

interface Props {
  order: any;
  store: any;
  variant?: 'customer' | 'kitchen';
  /**
   * OrderItem ids fired in this round. The kitchen copy prints only these —
   * the cooks must not re-make food from earlier rounds. The customer copy
   * always shows the whole running bill, and uses this only to flag which
   * lines are new.
   */
  roundItemIds?: string[];
}

const TYPE_LABEL: Record<string, string> = {
  DINE_IN: 'ทานที่ร้าน / Dine-in',
  TAKEAWAY: 'กลับบ้าน / Takeaway',
  DELIVERY: 'เดลิเวอรี่ / Delivery',
};

// ไม่ใช้ emoji — เครื่องปริ้นความร้อนปริ้น emoji ไม่ออก (ขึ้นเป็นกล่อง)
export function OrderSlip({ order, store, variant = 'customer', roundItemIds }: Props) {
  if (!order || !store) return null;

  const isKitchen = variant === 'kitchen';
  const roundSet = roundItemIds?.length ? new Set(roundItemIds) : null;

  // Voided quantity never reaches the kitchen or the guest's copy.
  const remainingQty = (it: any) => it.quantity - (it.refundedQty || 0);
  const liveItems = (order.items || []).filter((it: any) => remainingQty(it) > 0);
  const items = isKitchen && roundSet ? liveItems.filter((it: any) => roundSet.has(it.id)) : liveItems;

  // A round that doesn't cover the whole bill means the kitchen already got an
  // earlier ticket for this table — say so, loudly, on the kitchen copy.
  const isAddOnRound = !!roundSet && liveItems.some((it: any) => !roundSet.has(it.id));

  // The kitchen cares when *this round* was fired, not when the table's bill
  // was opened — on an add-on those differ by however long the guests took.
  const firedAt =
    (items as any[]).reduce(
      (earliest: string | null, it: any) =>
        it.createdAt && (!earliest || it.createdAt < earliest) ? it.createdAt : earliest,
      null as string | null
    ) || order.createdAt;

  return (
    <>
      <style jsx global>{`
        @media print {
          @page {
            size: 80mm auto;
            margin: 0;
          }
          body * { visibility: hidden; }
          #slip-printable, #slip-printable * { visibility: visible; }
          /* The slip is previewed inside a Radix dialog: a fixed, transformed,
             max-height + overflow-auto box. Left alone that box clips the slip
             to one screen-height page (a 10-line order prints half-cut), and
             its transform makes it the containing block for the absolutely
             positioned slip below. Flatten it for print. */
          [role='dialog'] {
            position: static !important;
            transform: none !important;
            max-width: none !important;
            max-height: none !important;
            overflow: visible !important;
            padding: 0 !important;
            border: 0 !important;
            box-shadow: none !important;
            background: #fff !important;
          }
          #slip-printable {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
          }
          .no-print { display: none !important; }
        }
        #slip-printable {
          font-family: 'IBM Plex Sans Thai', 'Sarabun', system-ui, sans-serif;
          color: #111;
          background: #fff;
          font-feature-settings: 'tnum' on;
        }
        #slip-printable .dashed { border-top: 1px dashed #999; }
      `}</style>

      <div
        id="slip-printable"
        className="mx-auto bg-white"
        style={{
          width: '80mm',
          fontSize: isKitchen ? '13px' : '12px',
          padding: '8px 10px',
          lineHeight: 1.45,
        }}
      >
        {/* ==================== HEADER ==================== */}
        {isKitchen ? (
          <div className="text-center">
            <div style={{ fontSize: '20px', fontWeight: 800, letterSpacing: '0.08em' }}>
              KITCHEN / ครัว
            </div>
            {isAddOnRound && (
              <div
                style={{
                  marginTop: 4,
                  border: '2px solid #111',
                  padding: '2px 8px',
                  display: 'inline-block',
                  fontWeight: 800,
                  fontSize: '13px',
                }}
              >
                เพิ่มรายการ / ADD-ON
              </div>
            )}
          </div>
        ) : (
          <div className="text-center">
            {store.logo && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={store.logo} alt="logo" className="mx-auto mb-1.5" style={{ maxHeight: '48px' }} />
            )}
            <div style={{ fontSize: '16px', fontWeight: 800, letterSpacing: '0.02em', lineHeight: 1.2 }}>
              {store.name}
            </div>
            {store.address && (
              <div style={{ fontSize: '10px', color: '#555', marginTop: 2 }}>{store.address}</div>
            )}
            {store.phone && <div style={{ fontSize: '10px', color: '#555' }}>☎ {store.phone}</div>}
          </div>
        )}

        {/* ==================== SLIP TYPE ==================== */}
        {!isKitchen && (
          <div className="text-center my-2">
            <div
              style={{
                display: 'inline-block',
                border: '1.5px solid #111',
                padding: '2px 10px',
                fontWeight: 700,
                fontSize: '11px',
                letterSpacing: '0.05em',
                borderRadius: 4,
              }}
            >
              ใบรายการอาหาร / ORDER SLIP
            </div>
            <div style={{ fontSize: '10px', color: '#555', marginTop: 3 }}>
              ยังไม่ชำระเงิน — ไม่ใช่ใบเสร็จรับเงิน / NOT A RECEIPT
            </div>
          </div>
        )}

        {/* ==================== TABLE (kitchen: the thing cooks look for) ==================== */}
        {isKitchen && (
          <div className="text-center" style={{ margin: '6px 0' }}>
            {order.table ? (
              <div style={{ fontSize: '34px', fontWeight: 800, lineHeight: 1.1 }}>
                โต๊ะ {order.table.number}
              </div>
            ) : (
              <div style={{ fontSize: '22px', fontWeight: 800 }}>
                {order.type === 'TAKEAWAY' ? 'กลับบ้าน' : order.type === 'DELIVERY' ? 'เดลิเวอรี่' : '-'}
              </div>
            )}
            <div style={{ fontSize: '12px', fontWeight: 600, marginTop: 2 }}>
              {order.orderNumber} · {formatTime(firedAt)}
            </div>
          </div>
        )}

        {/* ==================== ORDER META ==================== */}
        {!isKitchen && (
          <div className="space-y-0.5" style={{ fontSize: '11px' }}>
            <Meta label="No." value={order.orderNumber} bold />
            <Meta label="Date" value={formatDate(order.createdAt)} />
            {order.table && <Meta label="Table" value={`โต๊ะ ${order.table.number}`} bold />}
            {order.type && <Meta label="Type" value={TYPE_LABEL[order.type] || order.type} />}
            {order.cashier && <Meta label="Staff" value={order.cashier.name} />}
            {order.customer && <Meta label="Member" value={order.customer.name} bold />}
          </div>
        )}

        <div className="dashed my-2" />

        {/* ==================== ITEMS ==================== */}
        {isKitchen ? (
          <div className="space-y-2">
            {items.map((it: any) => (
              <div key={it.id} style={{ paddingBottom: 4, borderBottom: '1px dashed #ccc' }}>
                <div className="flex gap-2" style={{ fontSize: '17px', fontWeight: 800, lineHeight: 1.25 }}>
                  <span className="tabular-nums shrink-0">{remainingQty(it)}×</span>
                  <span className="flex-1 break-words">{it.product?.name}</span>
                </div>
                {it.variants?.length > 0 && (
                  <div style={{ fontSize: '13px', fontWeight: 600, paddingLeft: 22 }}>
                    {it.variants.map((v: any) => v.name).join(' · ')}
                  </div>
                )}
                {it.notes && (
                  <div
                    style={{
                      fontSize: '14px',
                      fontWeight: 700,
                      paddingLeft: 22,
                      border: '1px solid #111',
                      padding: '2px 4px',
                      marginTop: 2,
                    }}
                  >
                    ** {it.notes}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-1.5">
            {items.map((it: any) => {
              const qty = remainingQty(it);
              const lineTotal = Number(it.unitPrice) * qty;
              const isNew = !!roundSet && roundSet.has(it.id);
              return (
                <div key={it.id}>
                  <div className="flex justify-between gap-2">
                    <div className="flex-1 break-words" style={{ fontWeight: 500 }}>
                      {it.product?.name}
                      {isNew && roundSet && isAddOnRound && (
                        <span style={{ fontSize: '9px', fontWeight: 700, marginLeft: 4 }}>[ใหม่]</span>
                      )}
                    </div>
                    <div className="tabular-nums shrink-0">{lineTotal.toFixed(2)}</div>
                  </div>
                  <div style={{ fontSize: '10px', color: '#666' }}>
                    {qty} × {Number(it.unitPrice).toFixed(2)}
                  </div>
                  {it.variants?.length > 0 && (
                    <div style={{ fontSize: '10px', color: '#666', paddingLeft: 6 }}>
                      {it.variants.map((v: any) => v.name).join(' · ')}
                    </div>
                  )}
                  {it.notes && (
                    <div style={{ fontSize: '10px', color: '#777', fontStyle: 'italic', paddingLeft: 6 }}>
                      ↪ {it.notes}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ==================== ORDER-LEVEL NOTE ==================== */}
        {order.notes && (
          <div
            style={{
              marginTop: 8,
              border: '1px dashed #111',
              padding: '4px 6px',
              fontSize: isKitchen ? '13px' : '10.5px',
              fontWeight: isKitchen ? 700 : 500,
            }}
          >
            หมายเหตุ: {order.notes}
          </div>
        )}

        {/* ==================== TOTALS (customer copy only) ==================== */}
        {!isKitchen && (
          <>
            <div className="dashed my-2" />
            <div className="space-y-1" style={{ fontSize: '12px' }}>
              <Row label="ยอดรวม / Subtotal" value={formatCurrency(order.subtotal)} muted />
              {Number(order.discount) > 0 && (
                <Row label="ส่วนลด / Discount" value={`-${formatCurrency(order.discount)}`} muted />
              )}
              {Number(order.serviceCharge) > 0 && (
                <Row label="ค่าบริการ / Service" value={formatCurrency(order.serviceCharge)} muted />
              )}
              {Number(order.tax) > 0 && (
                <Row
                  label={store.priceIncludesTax ? `VAT ${store.taxRate}% (incl.)` : `VAT ${store.taxRate}%`}
                  value={formatCurrency(order.tax)}
                  tiny
                />
              )}
              <div
                className="flex items-center justify-between"
                style={{
                  borderTop: '2px solid #111',
                  borderBottom: '2px solid #111',
                  padding: '6px 0',
                  marginTop: 6,
                }}
              >
                <span style={{ fontWeight: 700, fontSize: '13px' }}>ยอดที่ต้องชำระ / Total</span>
                <span className="tabular-nums" style={{ fontWeight: 800, fontSize: '16px' }}>
                  {formatCurrency(order.total)}
                </span>
              </div>
            </div>
          </>
        )}

        {/* ==================== FOOTER ==================== */}
        <div
          className="text-center"
          style={{ fontSize: isKitchen ? '11px' : '10px', color: '#555', marginTop: 10 }}
        >
          {isKitchen ? (
            <div style={{ fontWeight: 600, color: '#111' }}>
              — {items.reduce((s: number, it: any) => s + remainingQty(it), 0)} รายการ · สั่ง{' '}
              {formatTime(firedAt)} —
            </div>
          ) : (
            <>
              <div style={{ fontWeight: 600, fontSize: '11px', color: '#111' }}>
                กรุณาตรวจสอบรายการอาหาร
              </div>
              <div style={{ marginTop: 2 }}>ชำระเงินที่เคาน์เตอร์ · Please pay at the counter</div>
            </>
          )}
        </div>
      </div>
    </>
  );
}

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
}: {
  label: string;
  value: string;
  muted?: boolean;
  tiny?: boolean;
}) {
  return (
    <div
      className="flex justify-between gap-2"
      style={{ color: muted ? '#555' : '#111', fontSize: tiny ? '10.5px' : undefined }}
    >
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
