/**
 * Optional retry-safety for order creation. A client that lost the connection
 * after sending POST /orders (or /orders/open) can resend it with the same
 * `Idempotency-Key` header (or `clientRequestId` body field) and get the
 * ORIGINAL order back instead of a duplicate bill + double stock deduction.
 *
 * The key row is inserted inside the order's own transaction, so it exists iff
 * the order committed, and the unique index makes two concurrent retries
 * race safely (the loser's transaction rolls back with P2002).
 */
import type { Request } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { BadRequest } from '../../utils/errors';

export type IdempotencyScope =
  | 'orders:create'
  | 'orders:open'
  | `orders:items:${string}`   // add-round, scoped to the order id
  | `orders:settle:${string}`   // settle, scoped to the order id
  | `orders:move:${string}`     // move-table, scoped to the order id
  | `orders:merge:${string}`    // merge (target order id)
  | `orders:split:${string}`;   // split (source order id); key row points at the NEW bill

export const addRoundScope = (orderId: string): IdempotencyScope => `orders:items:${orderId}`;
export const moveScope = (orderId: string): IdempotencyScope => `orders:move:${orderId}`;
export const mergeScope = (orderId: string): IdempotencyScope => `orders:merge:${orderId}`;
export const splitScope = (orderId: string): IdempotencyScope => `orders:split:${orderId}`;
export const settleScope = (orderId: string): IdempotencyScope => `orders:settle:${orderId}`;

const KEY_RE = /^[A-Za-z0-9_.:\-]{8,128}$/;
const KEEP_MS = 7 * 24 * 3600_000;

/** Header wins over body field; undefined when the client didn't send one. */
export function readIdempotencyKey(req: Pick<Request, 'header' | 'body'>): string | undefined {
  const raw = req.header('idempotency-key') ?? req.body?.clientRequestId;
  if (raw === undefined || raw === null || raw === '') return undefined;
  if (typeof raw !== 'string' || !KEY_RE.test(raw)) {
    throw BadRequest('Idempotency-Key ต้องเป็นตัวอักษร/ตัวเลข/-_.: ยาว 8-128 ตัว', 'BAD_IDEMPOTENCY_KEY');
  }
  return raw;
}

/** Called inside the order transaction. Throws P2002 if the key already exists. */
export async function recordIdempotencyKey(
  tx: Prisma.TransactionClient, storeId: string, scope: IdempotencyScope, key: string, orderId: string,
) {
  await tx.idempotencyKey.create({ data: { storeId, scope, key, orderId } });
}

export const isIdempotencyConflict = (e: unknown) =>
  e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002' &&
  JSON.stringify(e.meta?.target ?? '').includes('key');

/** The order created by an earlier request with this key, if any. */
export async function findReplay(storeId: string, scope: IdempotencyScope, key: string) {
  const row = await prisma.idempotencyKey.findUnique({ where: { storeId_scope_key: { storeId, scope, key } } });
  if (!row) return null;
  const order = await prisma.order.findUnique({
    where: { id: row.orderId },
    include: {
      items: { include: { product: true } },
      payments: true,
      customer: true,
      table: true,
      cashier: { select: { id: true, name: true } },
    },
  });
  if (!order) return null;
  // A settle response carries `appliedReward`; rebuild it so a replay looks the same.
  if (scope.startsWith('orders:settle:')) {
    const red = await prisma.rewardRedemption.findFirst({
      where: { orderId: order.id, storeId },
      include: { reward: { select: { name: true, kind: true, discountAmount: true } } },
    });
    const applied = red && red.reward.kind === 'DISCOUNT'
      ? Math.min(Number(red.reward.discountAmount ?? 0), Math.max(0, Number(order.discount) - Number(order.promotionDiscount ?? 0)))
      : 0;
    return Object.assign(order, {
      appliedReward: red ? { code: red.code, name: red.reward.name, kind: red.reward.kind, discountApplied: applied } : null,
    });
  }
  return order;
}

/** Opportunistic cleanup so the table doesn't grow forever (no cron needed). */
export function maybePruneKeys() {
  if (Math.random() > 0.02) return;
  prisma.idempotencyKey.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - KEEP_MS) } } }).catch(() => {});
}

/**
 * Runs `create` once per key. Returns { order, replay }.
 * Without a key it simply runs `create`.
 */
export async function runIdempotent<T>(
  storeId: string, scope: IdempotencyScope, key: string | undefined, create: (key?: string) => Promise<T>,
): Promise<{ order: T; replay: boolean }> {
  if (!key) return { order: await create(), replay: false };
  const existing = await findReplay(storeId, scope, key);
  if (existing) return { order: existing as unknown as T, replay: true };
  try {
    const order = await create(key);
    maybePruneKeys();
    return { order, replay: false };
  } catch (e) {
    if (isIdempotencyConflict(e)) {
      const won = await findReplay(storeId, scope, key);
      if (won) return { order: won as unknown as T, replay: true };
    }
    throw e;
  }
}
