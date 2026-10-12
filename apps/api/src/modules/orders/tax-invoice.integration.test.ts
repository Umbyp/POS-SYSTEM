/**
 * Integration: Thai full tax invoice — numbering, validation, immutability, VAT math,
 * tenant isolation, refund flag. Real local Postgres via the real router, self-cleaning.
 */
import 'dotenv/config';
import http from 'http';
import express from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../config/prisma';
import { signToken } from '../../utils/jwt';
import { errorMiddleware } from '../../middleware/error.middleware';
import orderRoutes from './order.routes';
import * as tabService from './order-tab.service';
import { withCheckDigit } from './tax-invoice.math.test';

const fakeIo = { to: () => ({ emit: () => {} }), of: () => ({ to: () => ({ emit: () => {} }) }) } as any;
const stamp = Date.now();
const SELLER_TAX = withCheckDigit('010555500012');
const BUYER_TAX = withCheckDigit('110170023070');
const buyer = { customerName: 'บริษัท ผู้ซื้อ จำกัด', customerTaxId: BUYER_TAX, customerAddress: '1 ถนนสีลม กรุงเทพฯ 10500' };

describe('tax invoice (integration)', () => {
  let server: http.Server; let base: string;
  let incl: string, excl: string, bare: string, other: string; // stores
  const users: Record<string, { id: string; tok: string }> = {};
  const products: Record<string, string> = {};
  const created = { stores: [] as string[], users: [] as string[] };

  const call = async (tok: string, method: string, path: string, body?: any) => {
    const r = await fetch(base + path, {
      method, headers: { 'content-type': 'application/json', authorization: `Bearer ${tok}` },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: r.status, body: await r.json().catch(() => null) };
  };
  const mkStore = async (key: string, data: any) => {
    const s = await prisma.store.create({ data: { name: `TEST_TI_${key}_${stamp}`, ...data } });
    created.stores.push(s.id);
    const u = await prisma.user.create({ data: { email: `ti-${key}-${stamp}@test.local`, name: key, role: 'OWNER', storeId: s.id } });
    created.users.push(u.id);
    users[key] = { id: u.id, tok: await signToken({ id: u.id, email: u.email, role: u.role, storeId: s.id }) };
    const cat = await prisma.category.create({ data: { name: 'C', storeId: s.id } });
    products[key] = (await prisma.product.create({
      data: { name: 'ข้าวผัด', sku: `TI-${key}-${stamp}`, costPrice: 10, sellingPrice: 33.33, categoryId: cat.id, storeId: s.id },
    })).id;
    return s.id;
  };
  const taxStore = { address: '99 ถนนสุขุมวิท กรุงเทพฯ', taxId: SELLER_TAX, taxRate: 7, invoicePrefix: 'TI' };
  /** A paid bill: qty × 33.33 with optional discount. */
  const paidOrder = async (key: string, storeId: string, qty = 3, discount = 0) => {
    const o = await tabService.openTab({ storeId, cashierId: users[key].id, type: 'TAKEAWAY', items: [{ productId: products[key], quantity: qty }] }, fakeIo);
    return tabService.settleTab(o.id, { storeId, cashierId: users[key].id, discount, payments: [{ method: 'CASH', amount: 1000 }] }, fakeIo) as Promise<any>;
  };
  const unpaidOrder = (key: string, storeId: string) =>
    tabService.openTab({ storeId, cashierId: users[key].id, type: 'TAKEAWAY', items: [{ productId: products[key], quantity: 1 }] }, fakeIo);

  beforeAll(async () => {
    incl = await mkStore('incl', { ...taxStore, priceIncludesTax: true, serviceCharge: 10 });
    excl = await mkStore('excl', { ...taxStore, priceIncludesTax: false, serviceCharge: 0 });
    bare = await mkStore('bare', { priceIncludesTax: true }); // no tax id / address
    other = await mkStore('other', { ...taxStore, priceIncludesTax: true });
    const app = express();
    app.use(express.json());
    app.set('io', fakeIo);
    app.use('/orders', orderRoutes);
    app.use(errorMiddleware);
    server = app.listen(0);
    base = `http://127.0.0.1:${(server.address() as any).port}`;
  });

  afterAll(async () => {
    server?.close();
    const sid = { in: created.stores };
    await prisma.payment.deleteMany({ where: { order: { storeId: sid } } });
    await prisma.orderItem.deleteMany({ where: { order: { storeId: sid } } });
    await prisma.order.deleteMany({ where: { storeId: sid } });
    await prisma.activityLog.deleteMany({ where: { userId: { in: created.users } } });
    await prisma.product.deleteMany({ where: { storeId: sid } });
    await prisma.category.deleteMany({ where: { storeId: sid } });
    await prisma.user.deleteMany({ where: { storeId: sid } });
    await prisma.store.deleteMany({ where: { id: sid } });
    await prisma.$disconnect();
  });

  it('concurrent issuing yields distinct, gap-free sequential numbers', async () => {
    const orders = await Promise.all([1, 2, 3, 4, 5, 6].map(() => paidOrder('incl', incl, 1)));
    const rs = await Promise.all(orders.map((o) => call(users.incl.tok, 'POST', `/orders/${o.id}/tax-invoice`, buyer)));
    expect(rs.map((r) => r.status)).toEqual(Array(6).fill(200));
    const nums = rs.map((r) => r.body.number).sort();
    expect(new Set(nums).size).toBe(6);
    const seqs = nums.map((n) => Number(n.split('-')[2])).sort((a, b) => a - b);
    expect(seqs).toEqual([1, 2, 3, 4, 5, 6]);
    expect(nums[0]).toMatch(/^TI-\d{4}-\d{6}$/);
    expect((await prisma.store.findUniqueOrThrow({ where: { id: incl } })).taxInvoiceCounter).toBe(6);
  });

  it('concurrent issue of the SAME order consumes exactly one number', async () => {
    const o = await paidOrder('excl', excl, 1);
    const before = (await prisma.store.findUniqueOrThrow({ where: { id: excl } })).taxInvoiceCounter;
    const rs = await Promise.all([1, 2, 3].map(() => call(users.excl.tok, 'POST', `/orders/${o.id}/tax-invoice`, buyer)));
    expect(new Set(rs.map((r) => r.body.number)).size).toBe(1);
    expect(rs.filter((r) => r.body.created).length).toBe(1);
    expect((await prisma.store.findUniqueOrThrow({ where: { id: excl } })).taxInvoiceCounter).toBe(before + 1);
  });

  it('is idempotent and ignores different buyer details on re-issue', async () => {
    const o = await paidOrder('incl', incl, 1);
    const a = await call(users.incl.tok, 'POST', `/orders/${o.id}/tax-invoice`, buyer);
    const b = await call(users.incl.tok, 'POST', `/orders/${o.id}/tax-invoice`, { ...buyer, customerName: 'คนอื่น' });
    expect(b.status).toBe(200);
    expect(b.body.number).toBe(a.body.number);
    expect(b.body.created).toBe(false);
    expect(b.body.buyer.name).toBe(buyer.customerName);
    expect(new Date(b.body.issuedAt).getTime()).toBe(new Date(a.body.issuedAt).getTime());
  });

  it('validates the buyer, the seller config and payment state', async () => {
    const o = await paidOrder('incl', incl, 1);
    const url = `/orders/${o.id}/tax-invoice`;
    const badSum = await call(users.incl.tok, 'POST', url, { ...buyer, customerTaxId: BUYER_TAX.slice(0, 12) + String((Number(BUYER_TAX[12]) + 1) % 10) });
    expect(badSum.status).toBe(400); expect(badSum.body.code).toBe('BUYER_TAX_ID_INVALID');
    expect((await call(users.incl.tok, 'POST', url, { ...buyer, customerBranch: '12' })).body.code).toBe('BUYER_BRANCH_INVALID');
    expect((await call(users.incl.tok, 'POST', url, { ...buyer, customerAddress: '' })).status).toBe(400);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: o.id } })).taxInvoiceNo).toBeNull();

    const noStoreTax = await paidOrder('bare', bare, 1);
    const r = await call(users.bare.tok, 'POST', `/orders/${noStoreTax.id}/tax-invoice`, buyer);
    expect(r.status).toBe(400); expect(r.body.code).toBe('STORE_TAX_INFO_MISSING');
    expect((await prisma.store.findUniqueOrThrow({ where: { id: bare } })).taxInvoiceCounter).toBe(0);

    const unpaid = await unpaidOrder('incl', incl);
    const u = await call(users.incl.tok, 'POST', `/orders/${unpaid.id}/tax-invoice`, buyer);
    expect(u.status).toBe(400); expect(u.body.code).toBe('ORDER_NOT_PAID');
    // failed attempts must not burn numbers
    const nums = (await prisma.order.findMany({ where: { storeId: incl, taxInvoiceNo: { not: null } } })).length;
    expect((await prisma.store.findUniqueOrThrow({ where: { id: incl } })).taxInvoiceCounter).toBe(nums);
  });

  it('PATCH cannot change buyer details after issuance (409) but notes still work', async () => {
    const o = await paidOrder('incl', incl, 1);
    expect((await call(users.incl.tok, 'PATCH', `/orders/${o.id}`, { customerName: 'X' })).status).toBe(200); // before issuance: allowed
    await call(users.incl.tok, 'POST', `/orders/${o.id}/tax-invoice`, buyer);
    const p = await call(users.incl.tok, 'PATCH', `/orders/${o.id}`, { customerTaxId: '0000000000000' });
    expect(p.status).toBe(409); expect(p.body.code).toBe('TAX_INVOICE_ISSUED');
    expect((await call(users.incl.tok, 'PATCH', `/orders/${o.id}`, { notes: 'ok' })).status).toBe(200);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: o.id } })).customerTaxId).toBe(BUYER_TAX);
  });

  it('tax-inclusive: VAT backed out, lines sum to subtotal, ex-VAT + VAT + service = paid', async () => {
    const o = await paidOrder('incl', incl, 3, 10); // 3 × 33.33 = 99.99, −10, +10% service on 89.99
    const r = await call(users.incl.tok, 'POST', `/orders/${o.id}/tax-invoice`, buyer);
    const inv = r.body;
    const sum = Math.round(inv.items.reduce((s: number, i: any) => s + i.lineTotal, 0) * 100) / 100;
    expect(sum).toBe(inv.totals.subtotalExVat);
    expect(Math.round((inv.totals.subtotalExVat - inv.totals.discount) * 100) / 100).toBe(inv.totals.baseExVat);
    expect(Math.round((inv.totals.baseExVat + inv.totals.vat) * 100) / 100).toBe(89.99);
    expect(inv.totals.vat).toBe(Number(o.tax));
    expect(inv.totals.serviceCharge).toBe(Number(o.serviceCharge));
    expect(inv.totals.total).toBe(Number(o.total));
    expect(inv.seller.branch).toBe('สำนักงานใหญ่');
    expect(inv.buyer.branch).toBe('สำนักงานใหญ่');
    expect(inv.text).toContain(inv.number);
    expect((await call(users.incl.tok, 'GET', `/orders/${o.id}/tax-invoice?width=48`)).body.text.split('\n')[0].trim()).toContain('ใบกำกับภาษี');
  });

  it('tax-exclusive: prices unchanged, VAT added on top, total matches the bill', async () => {
    const o = await paidOrder('excl', excl, 3, 10);
    const inv = (await call(users.excl.tok, 'POST', `/orders/${o.id}/tax-invoice`, buyer)).body;
    expect(inv.totals.subtotalExVat).toBe(99.99);
    expect(inv.totals.discount).toBe(10);
    expect(inv.totals.baseExVat).toBe(89.99);
    expect(inv.totals.vat).toBe(Number(o.tax));
    expect(Math.round((inv.totals.baseExVat + inv.totals.vat) * 100) / 100).toBe(Number(o.total));
    expect(inv.totals.total).toBe(Number(o.total));
    expect(inv.items.reduce((s: number, i: any) => s + i.lineTotal, 0)).toBeCloseTo(99.99, 10);
  });

  it('tenant isolation: other stores cannot issue or read', async () => {
    const o = await paidOrder('incl', incl, 1);
    expect((await call(users.other.tok, 'POST', `/orders/${o.id}/tax-invoice`, buyer)).status).toBe(404);
    await call(users.incl.tok, 'POST', `/orders/${o.id}/tax-invoice`, buyer);
    expect((await call(users.other.tok, 'GET', `/orders/${o.id}/tax-invoice`)).status).toBe(404);
    expect((await call(users.incl.tok, 'GET', `/orders/${o.id}/tax-invoice`)).status).toBe(200);
  });

  it('GET before issuance is 404; each store has its own sequence', async () => {
    const o = await paidOrder('incl', incl, 1);
    expect((await call(users.incl.tok, 'GET', `/orders/${o.id}/tax-invoice`)).status).toBe(404);
    const o2 = await paidOrder('other', other, 1);
    const r = await call(users.other.tok, 'POST', `/orders/${o2.id}/tax-invoice`, buyer);
    expect(r.body.number).toMatch(/-000001$/);
  });

  it('refund after issuance is allowed and flags taxInvoiceIssued; refund of an unissued bill does not', async () => {
    const o = await paidOrder('incl', incl, 2);
    await call(users.incl.tok, 'POST', `/orders/${o.id}/tax-invoice`, buyer);
    const item = (await prisma.orderItem.findFirstOrThrow({ where: { orderId: o.id } }));
    const part = await call(users.incl.tok, 'POST', `/orders/${o.id}/refund-items`, { items: [{ orderItemId: item.id, qty: 1 }] });
    expect(part.status).toBe(200); expect(part.body.taxInvoiceIssued).toBe(true);
    const full = await call(users.incl.tok, 'POST', `/orders/${o.id}/refund`);
    expect(full.status).toBe(200); expect(full.body.taxInvoiceIssued).toBe(true);
    const logs = await prisma.activityLog.findMany({ where: { userId: users.incl.id, action: { in: ['REFUND', 'PARTIAL_REFUND'] } } });
    expect(logs.some((l) => (l.metadata as any)?.orderId === o.id && (l.metadata as any)?.taxInvoiceIssued === true)).toBe(true);
    // refunded bills cannot get a NEW invoice
    const o2 = await paidOrder('incl', incl, 1);
    const f2 = await call(users.incl.tok, 'POST', `/orders/${o2.id}/refund`);
    expect(f2.body.taxInvoiceIssued).toBe(false);
    expect((await call(users.incl.tok, 'POST', `/orders/${o2.id}/tax-invoice`, buyer)).body.code).toBe('ORDER_REFUNDED');
  });

  it('logs TAX_INVOICE_ISSUED', async () => {
    const n = await prisma.activityLog.count({ where: { userId: users.incl.id, action: 'TAX_INVOICE_ISSUED' } });
    expect(n).toBeGreaterThan(0);
  });
});
