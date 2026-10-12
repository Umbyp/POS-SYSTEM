import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { BadRequest, NotFound } from '../../utils/errors';
import {
  isValidThaiTaxId, normalizeBranch, sellerBranchLabel, formatTaxInvoiceNo, computeBreakdown, HEAD_OFFICE,
} from './tax-invoice.math';
import { renderTaxInvoiceText } from './tax-invoice.text';

export interface TaxInvoiceBuyerInput {
  customerName: string;
  customerTaxId: string;
  customerAddress: string;
  customerBranch?: string | null;
}

const METHOD_LABEL: Record<string, string> = {
  CASH: 'เงินสด', PROMPTPAY: 'พร้อมเพย์', CREDIT_CARD: 'บัตรเครดิต', BANK_TRANSFER: 'โอนเงิน',
};

function assertIssuable(order: { status: string; payments: unknown[] }) {
  if (order.status === 'REFUNDED') throw BadRequest('บิลนี้คืนเงินแล้ว ออกใบกำกับภาษีไม่ได้', 'ORDER_REFUNDED');
  if (order.status === 'CANCELLED' || order.status === 'DRAFT' || order.payments.length === 0) {
    throw BadRequest('บิลนี้ยังไม่ได้ชำระ/ถูกยกเลิก ออกใบกำกับภาษีไม่ได้', 'ORDER_NOT_PAID');
  }
}

function assertSellerReady(store: { name: string; address: string | null; taxId: string | null }) {
  if (!store.name?.trim() || !store.address?.trim() || !isValidThaiTaxId(store.taxId)) {
    throw BadRequest(
      'ต้องตั้งค่าชื่อร้าน ที่อยู่ และเลขประจำตัวผู้เสียภาษี 13 หลัก (ที่ถูกต้อง) ของร้านก่อนออกใบกำกับภาษี',
      'STORE_TAX_INFO_MISSING',
    );
  }
}

/** Validate + normalise the buyer block. Throws 400 with a Thai message. */
export function validateBuyer(b: Partial<TaxInvoiceBuyerInput>) {
  const name = (b.customerName ?? '').trim();
  const address = (b.customerAddress ?? '').trim();
  const taxId = (b.customerTaxId ?? '').replace(/[\s-]/g, '');
  if (!name) throw BadRequest('กรุณากรอกชื่อผู้ซื้อ', 'BUYER_NAME_REQUIRED');
  if (!address) throw BadRequest('กรุณากรอกที่อยู่ผู้ซื้อ', 'BUYER_ADDRESS_REQUIRED');
  if (!isValidThaiTaxId(taxId)) throw BadRequest('เลขประจำตัวผู้เสียภาษีไม่ถูกต้อง (ต้องเป็นตัวเลข 13 หลักและผ่านการตรวจเลขท้าย)', 'BUYER_TAX_ID_INVALID');
  const branch = normalizeBranch(b.customerBranch);
  if (branch === null) throw BadRequest('สาขาต้องเป็น "สำนักงานใหญ่" หรือรหัสสาขา 5 หลัก', 'BUYER_BRANCH_INVALID');
  return { name, address, taxId, branch };
}

/** Issue (or return the already-issued) tax invoice. Number allocation is atomic with the order update. */
export async function issueTaxInvoice(orderId: string, storeId: string, userId: string, input: Partial<TaxInvoiceBuyerInput>) {
  const created = await prisma.$transaction(async (tx) => {
    // Lock the order row first (then the store row below) — same order every time, no deadlock cycle.
    const locked = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "Order" WHERE "id" = ${orderId} AND "storeId" = ${storeId} FOR UPDATE`;
    if (locked.length === 0) throw NotFound('Order not found');

    const order = await tx.order.findUniqueOrThrow({ where: { id: orderId }, include: { payments: { select: { id: true } } } });
    if (order.taxInvoiceNo) return false; // idempotent: already issued, buyer details stay as issued

    assertIssuable(order);
    const store = await tx.store.findUniqueOrThrow({ where: { id: storeId } });
    assertSellerReady(store);
    const buyer = validateBuyer(input);

    const now = new Date();
    // Row-locks the store until commit → numbers are strictly serial; a rollback also rolls the counter back (gap-free).
    const rows = await tx.$queryRaw<Array<{ taxInvoiceCounter: number }>>`
      UPDATE "Store" SET "taxInvoiceCounter" = "taxInvoiceCounter" + 1 WHERE "id" = ${storeId} RETURNING "taxInvoiceCounter"`;
    const taxInvoiceNo = formatTaxInvoiceNo(store.invoicePrefix, now, rows[0].taxInvoiceCounter);

    await tx.order.update({
      where: { id: orderId },
      data: {
        customerName: buyer.name, customerTaxId: buyer.taxId, customerAddress: buyer.address, customerBranch: buyer.branch,
        taxInvoiceNo, taxInvoiceIssuedAt: now,
      },
    });
    await tx.activityLog.create({
      data: { userId, action: 'TAX_INVOICE_ISSUED', metadata: { orderId, taxInvoiceNo, buyerTaxId: buyer.taxId } },
    });
    return true;
  });
  return { ...(await getTaxInvoice(orderId, storeId)), created };
}

export async function getTaxInvoice(orderId: string, storeId: string, width: 32 | 48 = 32) {
  const order = await prisma.order.findFirst({
    where: { id: orderId, storeId },
    include: { items: { include: { product: true }, orderBy: { createdAt: 'asc' } }, payments: true, store: true },
  });
  if (!order) throw NotFound('Order not found');
  if (!order.taxInvoiceNo || !order.taxInvoiceIssuedAt) throw NotFound('ยังไม่ได้ออกใบกำกับภาษีสำหรับบิลนี้');
  const store = order.store;

  const rawLines = order.items.map((it) => {
    const variants = Array.isArray(it.variants) ? (it.variants as any[]).map((v) => v?.name).filter(Boolean) : [];
    const gross = new Prisma.Decimal(it.unitPrice).mul(it.quantity).minus(it.discount);
    return {
      name: variants.length ? `${it.product.name} (${variants.join(', ')})` : it.product.name,
      quantity: it.quantity,
      lineNet: gross.toNumber(),
    };
  });
  const bd = computeBreakdown({
    priceIncludesTax: store.priceIncludesTax,
    taxRate: store.taxRate,
    subtotal: Number(order.subtotal),
    discount: Number(order.discount),
    tax: Number(order.tax),
    serviceCharge: Number(order.serviceCharge),
    lines: rawLines,
  });

  const seller = {
    name: store.name, address: store.address ?? '', taxId: store.taxId ?? '', branch: sellerBranchLabel(store),
  };
  const buyer = {
    name: order.customerName ?? '', address: order.customerAddress ?? '', taxId: order.customerTaxId ?? '',
    branch: normalizeBranch(order.customerBranch) ?? HEAD_OFFICE,
  };
  const items = rawLines.map((l, i) => ({
    name: l.name, qty: l.quantity, unitPrice: bd.lines[i].unitPriceExVat, lineTotal: bd.lines[i].lineTotalExVat,
  }));
  const payments = order.payments.map((p) => ({ method: p.method, label: METHOD_LABEL[p.method] ?? p.method, amount: Number(p.amount) }));

  return {
    number: order.taxInvoiceNo,
    issuedAt: order.taxInvoiceIssuedAt,
    orderId: order.id,
    orderNumber: order.orderNumber,
    priceIncludesTax: store.priceIncludesTax,
    seller, buyer, items,
    totals: bd.totals,
    payments,
    refundedAmount: Number(order.refundedAmount),
    text: renderTaxInvoiceText({
      seller, buyer, number: order.taxInvoiceNo, issuedAt: order.taxInvoiceIssuedAt, orderNumber: order.orderNumber,
      items, totals: bd.totals, payments,
    }, width),
  };
}
