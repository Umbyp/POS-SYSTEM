'use client';
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { formatCurrency, formatDate, formatTime } from '@/lib/format';
import { usePrintIsolation } from '@/lib/printIsolation';
import { THERMAL_CONTENT_WIDTH, THERMAL_PAPER_WIDTH } from '@/lib/paper';

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
  const [qrUrl, setQrUrl] = useState('');

  // Keeps the printed page as long as the ticket and no longer.
  usePrintIsolation('slip-printable');

  const loyaltyOn = !!store?.loyaltyMode && store.loyaltyMode !== 'OFF';
  const pointsOn = store?.loyaltyMode === 'POINTS' || store?.loyaltyMode === 'BOTH';
  const stampsOn = store?.loyaltyMode === 'STAMPS' || store?.loyaltyMode === 'BOTH';

  // The guest copy always carries a points QR; which one depends on whether a
  // member is on the bill (the kitchen copy never gets one):
  //
  //   no member  → the order-scoped claim link, same as the receipt's. The
  //                portal registers a new phone or looks up an existing one,
  //                then credits this one order — once only (claimOrderPoints
  //                sets order.customerId, so a second scan is ALREADY_CLAIMED).
  //   member     → the plain portal link, so they can scan and see their card.
  //                Their earn is applied at checkout, and the claim endpoint
  //                would (correctly) refuse an order that already has a member,
  //                so pointing this QR at the order would only show an error.
  const onGuestCopy = variant === 'customer' && loyaltyOn;
  const pointsQrOn = store?.receiptShowPointsQr !== false;
  const showClaimQr = onGuestCopy && !order?.customer && pointsQrOn;
  const showMemberQr = onGuestCopy && !!order?.customer && pointsQrOn;
  const showSignupQr =
    onGuestCopy && !order?.customer && !pointsQrOn && store?.receiptShowSignupQr !== false;

  useEffect(() => {
    if (typeof window === 'undefined' || !store?.id || !(showClaimQr || showMemberQr || showSignupQr)) {
      return setQrUrl('');
    }
    // Only the claim link carries the order. Scanning it before the bill is
    // settled tells the guest to come back after paying (see member/page.tsx),
    // so they can register at the table and collect the moment they've paid.
    const url = showClaimQr
      ? `${window.location.origin}/member?storeId=${store.id}&order=${order.id}`
      : `${window.location.origin}/member?storeId=${store.id}`;
    QRCode.toDataURL(url, { width: 140, margin: 0 }).then(setQrUrl).catch(() => {});
  }, [store?.id, order?.id, showClaimQr, showMemberQr, showSignupQr]);

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

  // Nothing is credited until the bill is settled, so the slip promises rather
  // than reports. Mirrors points.service.calcEarnedPoints/calcEarnedStamps so
  // the number the guest reads here is the one they'll actually get.
  const total = Number(order.total);
  const pointsEarnBaht = Number(store.pointsEarnBaht ?? 0);
  const stampsEarnBaht = Number(store.stampsEarnBaht ?? 0);
  const pointsWillEarn = pointsOn && pointsEarnBaht > 0 ? Math.floor(total / pointsEarnBaht) : 0;
  const stampsWillEarn = stampsOn ? (stampsEarnBaht > 0 ? Math.floor(total / stampsEarnBaht) : 1) : 0;

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
            size: ${THERMAL_PAPER_WIDTH} auto;
            margin: 0;
          }

          /* Fallback path, for a browser that never fires beforeprint: the slip
             is the only visible thing and sits at the top of the page. Costs a
             tail of blank roll, but prints the right ticket. */
          body * { visibility: hidden; }
          #slip-printable, #slip-printable * { visibility: visible; }
          #slip-printable {
            position: absolute;
            left: 0;
            top: 0;
            width: ${THERMAL_CONTENT_WIDTH};
          }
          /* The slip is previewed inside a Radix dialog: a fixed, transformed,
             max-height + overflow-auto box, which would otherwise clip a long
             ticket to one screen-height page. */
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

          /* Real path (usePrintIsolation marked the tree): everything off the
             slip's branch leaves the flow, so the page ends where the slip ends
             and its length follows the order instead of the POS layout. */
          [data-print-hide] { display: none !important; }
          [data-print-keep] {
            display: block !important;
            position: static !important;
            transform: none !important;
            width: auto !important;
            max-width: none !important;
            /* height too, not just max-height: the dashboard shell is h-[100dvh],
               which would otherwise hold the page to one screen and clip a long
               ticket. */
            height: auto !important;
            min-height: 0 !important;
            max-height: none !important;
            overflow: visible !important;
            margin: 0 !important;
            padding: 0 !important;
            border: 0 !important;
            border-radius: 0 !important;
            box-shadow: none !important;
            background: #fff !important;
          }
          #slip-printable[data-print-keep] {
            position: static !important;
            /* Centred on the roll, inside what the head can actually image. The
               flatten rule above zeroes padding for the ancestors it unwraps —
               the slip needs its own back, or the text runs into the paper edge. */
            width: ${THERMAL_CONTENT_WIDTH} !important;
            margin: 0 auto !important;
            padding: 8px 10px !important;
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
          width: THERMAL_CONTENT_WIDTH,
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

        {/* ==================== LOYALTY (customer copy only) ==================== */}
        {/* No panels here on purpose: a tinted, bordered box is screen styling
            that a thermal printer renders as a grey smear at best. The totals
            block above already ends in a rule, so these blocks just need air. */}

        {/* A member is already on the bill — tell them what settling it earns. */}
        {!isKitchen && loyaltyOn && order.customer && (pointsWillEarn > 0 || stampsWillEarn > 0) && (
          <div className="mt-3 text-center" style={{ fontSize: '10.5px' }}>
            <div style={{ fontWeight: 600, marginBottom: 2 }}>สมาชิก: {order.customer.name}</div>
            <div>
              ชำระเงินแล้วจะได้รับ
              {pointsWillEarn > 0 && ` +${pointsWillEarn} แต้ม`}
              {pointsWillEarn > 0 && stampsWillEarn > 0 && ' ·'}
              {stampsWillEarn > 0 && ` +${stampsWillEarn} ดวง`}
            </div>
            {Number(order.pointsRedeemed) > 0 && (
              <div style={{ marginTop: 2 }}>ใช้แต้มในบิลนี้ {order.pointsRedeemed} แต้ม</div>
            )}
          </div>
        )}

        {/* The points QR — claim link for a walk-in, card link for a member. */}
        {qrUrl && (
          <div className="mt-3 text-center">
            <div style={{ fontWeight: 600, fontSize: '11px', marginBottom: 4 }}>
              {showClaimQr
                ? 'สแกนสะสมแต้ม / Scan to collect points'
                : showMemberQr
                ? 'สแกนดูแต้มสะสม / Scan for your points'
                : store.receiptSignupHeadline || 'สมัครสมาชิก เพื่อรับสิทธิพิเศษมากมาย!'}
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrUrl} alt="loyalty qr" className="mx-auto" />
            {showClaimQr ? (
              <>
                <div style={{ fontSize: 9.5, color: '#555', marginTop: 4 }}>
                  เก็บได้หลังชำระเงิน · 1 บิลเก็บได้ครั้งเดียว
                  {pointsWillEarn > 0 && ` — บิลนี้ได้ ${pointsWillEarn} แต้ม`}
                  {pointsWillEarn <= 0 && stampsWillEarn > 0 && ` — บิลนี้ได้ ${stampsWillEarn} ดวง`}
                </div>
                {store.receiptPointsTerms && (
                  <div style={{ fontSize: 9, color: '#888', marginTop: 3 }}>{store.receiptPointsTerms}</div>
                )}
              </>
            ) : showMemberQr ? (
              <div style={{ fontSize: 9.5, color: '#555', marginTop: 4 }}>
                แต้มของบิลนี้เข้าบัญชีอัตโนมัติเมื่อชำระเงิน
              </div>
            ) : (
              <div style={{ fontSize: 9.5, color: '#555', marginTop: 4, fontWeight: 600 }}>
                สแกนสมัครก่อนชำระเงิน แล้วแจ้งพนักงาน
                {pointsWillEarn > 0 && ` — บิลนี้ได้ ${pointsWillEarn} แต้ม`}
                {pointsWillEarn <= 0 && stampsWillEarn > 0 && ` — บิลนี้ได้ ${stampsWillEarn} ดวง`}
              </div>
            )}
          </div>
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
