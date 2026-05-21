/**
 * Mock data generator for analytics testing.
 *
 * Run AFTER `npm run db:seed` (which creates store + products + users).
 *
 * Generates 90 days of orders with realistic patterns:
 *   - Weekday volume: 30-60 orders/day, weekends: 50-90
 *   - Peak hours: 11-13 (lunch), 18-20 (dinner) — 3-4x baseline
 *   - Payment mix: 55% PromptPay, 30% Cash, 10% Credit Card, 5% Bank Transfer
 *   - Type mix: 60% DINE_IN, 25% TAKEAWAY, 15% DELIVERY
 *   - ~3% of orders refunded
 *   - Customers: 30 generated, 70% of orders attached to a returning customer
 *   - Loyalty points earned + occasionally redeemed
 *
 * Usage:
 *   cd apps/api
 *   npx ts-node prisma/seed-mock-orders.ts
 *   # or with custom days:
 *   DAYS=180 npx ts-node prisma/seed-mock-orders.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DAYS = Number(process.env.DAYS) || 90;
const STORE_NAME = process.env.STORE_NAME || 'My Café POS';

// Deterministic-ish random for reproducible runs
let seed = 42;
function rand() {
  seed = (seed * 9301 + 49297) % 233280;
  return seed / 233280;
}
function randInt(min: number, max: number) {
  return Math.floor(rand() * (max - min + 1)) + min;
}
function pick<T>(arr: T[]): T {
  return arr[Math.floor(rand() * arr.length)];
}

// Weighted random pick
function pickWeighted<T>(items: { value: T; weight: number }[]): T {
  const total = items.reduce((s, i) => s + i.weight, 0);
  let r = rand() * total;
  for (const it of items) {
    r -= it.weight;
    if (r <= 0) return it.value;
  }
  return items[items.length - 1].value;
}

// Thai-style customer names
const FIRST_NAMES = [
  'Somsak', 'Suchart', 'Niran', 'Wirat', 'Kittisak', 'Apirak', 'Manat', 'Chaiwat',
  'Suda', 'Wanida', 'Pranee', 'Malee', 'Siriporn', 'Pimchanok', 'Ratana', 'Wilai',
  'Anan', 'Boonmee', 'Decha', 'Ekachai', 'Fuangfa', 'Ganok', 'Hattaya', 'Issara',
];
const LAST_NAMES = [
  'Saetang', 'Charoen', 'Wong', 'Sirikul', 'Boonsri', 'Tanaka', 'Suksawat',
  'Phromrak', 'Khaomek', 'Jaidee', 'Inthong', 'Saengthong', 'Promkaew',
];

async function main() {
  console.log(`🌱 Generating ${DAYS} days of mock orders...`);

  const store = await prisma.store.findFirst({ where: { name: STORE_NAME } });
  if (!store) throw new Error(`Store "${STORE_NAME}" not found — run npm run db:seed first`);

  const products = await prisma.product.findMany({ where: { storeId: store.id } });
  if (products.length === 0) throw new Error('No products found — run npm run db:seed first');

  const cashiers = await prisma.user.findMany({
    where: { storeId: store.id, role: { in: ['CASHIER', 'ADMIN', 'OWNER'] } },
  });
  const tables = await prisma.table.findMany({ where: { storeId: store.id } });

  // Wipe existing orders (keep products, users)
  console.log('🧹 Clearing old orders...');
  const existingOrders = await prisma.order.findMany({
    where: { storeId: store.id },
    select: { id: true },
  });
  const oldOrderIds = existingOrders.map((o) => o.id);
  console.log(`   Found ${oldOrderIds.length} existing orders to remove`);

  if (oldOrderIds.length > 0) {
    // Delete dependents in correct order
    await prisma.stockMovement.deleteMany({ where: { orderId: { in: oldOrderIds } } });
    await prisma.payment.deleteMany({ where: { orderId: { in: oldOrderIds } } });
    await prisma.orderItem.deleteMany({ where: { orderId: { in: oldOrderIds } } });
    await prisma.order.deleteMany({ where: { id: { in: oldOrderIds } } });
  }

  // Generate 30 customers
  console.log('👥 Generating customers...');
  await prisma.customer.deleteMany({ where: { storeId: store.id } });
  const customers: any[] = [];
  for (let i = 0; i < 30; i++) {
    const first = pick(FIRST_NAMES);
    const last = pick(LAST_NAMES);
    const c = await prisma.customer.create({
      data: {
        storeId: store.id,
        name: `${first} ${last[0]}.`,
        phone: `08${randInt(10000000, 99999999)}`,
        email: i % 3 === 0 ? `${first.toLowerCase()}${i}@example.com` : null,
      },
    });
    customers.push(c);
  }

  // Categorize products for realistic basket-building
  const beverages = products.filter((p) => /BEV-/.test(p.sku));
  const foods = products.filter((p) => /FOOD-/.test(p.sku));
  const desserts = products.filter((p) => /DES-/.test(p.sku));

  // Compose an order's items based on a realistic pattern
  function composeBasket(): any[] {
    // Most orders: 1 drink, sometimes + food, sometimes + dessert
    const pattern = pickWeighted([
      { value: 'drink', weight: 35 },
      { value: 'drink+drink', weight: 15 },
      { value: 'drink+food', weight: 25 },
      { value: 'drink+food+dessert', weight: 10 },
      { value: 'food', weight: 10 },
      { value: 'food+dessert', weight: 5 },
    ]);

    const items: any[] = [];
    const pushItem = (p: any) => {
      const existing = items.find((it) => it.productId === p.id);
      if (existing) existing.quantity++;
      else items.push({ productId: p.id, quantity: 1, unitPrice: Number(p.sellingPrice) });
    };

    if (pattern.includes('drink') && beverages.length) pushItem(pick(beverages));
    if (pattern === 'drink+drink' && beverages.length) pushItem(pick(beverages));
    if (pattern.includes('food') && foods.length) pushItem(pick(foods));
    if (pattern.includes('dessert') && desserts.length) pushItem(pick(desserts));

    // 20% chance to bump some item's quantity
    if (rand() < 0.2 && items.length) items[0].quantity++;

    return items;
  }

  // Orders per day pattern: weekends busier
  function ordersForDay(date: Date): number {
    const dow = date.getDay(); // 0 = Sun, 6 = Sat
    const isWeekend = dow === 0 || dow === 6;
    const isFriday = dow === 5;
    const base = isWeekend ? 65 : isFriday ? 55 : 40;
    return randInt(Math.floor(base * 0.7), Math.floor(base * 1.3));
  }

  // Pick hour with peaks at lunch/dinner
  function pickHour(): number {
    return pickWeighted([
      { value: 7, weight: 4 },
      { value: 8, weight: 6 },
      { value: 9, weight: 5 },
      { value: 10, weight: 4 },
      { value: 11, weight: 10 },
      { value: 12, weight: 18 }, // lunch peak
      { value: 13, weight: 12 },
      { value: 14, weight: 5 },
      { value: 15, weight: 4 },
      { value: 16, weight: 4 },
      { value: 17, weight: 6 },
      { value: 18, weight: 14 }, // dinner peak
      { value: 19, weight: 12 },
      { value: 20, weight: 8 },
      { value: 21, weight: 4 },
    ]);
  }

  function pickPayment(): string {
    return pickWeighted([
      { value: 'PROMPTPAY', weight: 55 },
      { value: 'CASH', weight: 30 },
      { value: 'CREDIT_CARD', weight: 10 },
      { value: 'BANK_TRANSFER', weight: 5 },
    ]);
  }

  function pickOrderType(): string {
    return pickWeighted([
      { value: 'DINE_IN', weight: 60 },
      { value: 'TAKEAWAY', weight: 25 },
      { value: 'DELIVERY', weight: 15 },
    ]);
  }

  const taxRate = Number(store.taxRate);
  const inclusive = store.priceIncludesTax;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let totalCreated = 0;
  let orderSeq = 1;
  const seqPrefix =
    'ORD' + String(today.getFullYear()).slice(2) + String(today.getMonth() + 1).padStart(2, '0');

  // Track aggregated customer updates so we can apply once at the end
  const customerAgg: Record<string, { spent: number; visits: number; points: number; lastAt: Date }> = {};

  // Build all order specs first (no DB calls), then bulk-insert with controlled concurrency
  type Spec = {
    orderNumber: string;
    cashierId: string;
    customerId: string | null;
    tableId: string | null;
    type: any;
    status: any;
    subtotal: number;
    discount: number;
    tax: number;
    total: number;
    paymentMethod: any;
    reference: string | null;
    createdAt: Date;
    items: { productId: string; quantity: number; unitPrice: number }[];
  };
  const specs: Spec[] = [];

  for (let d = DAYS; d >= 0; d--) {
    const day = new Date(today);
    day.setDate(today.getDate() - d);
    const count = ordersForDay(day);

    for (let i = 0; i < count; i++) {
      const orderTime = new Date(day);
      orderTime.setHours(pickHour(), randInt(0, 59), randInt(0, 59));

      const items = composeBasket();
      if (items.length === 0) continue;

      const subtotal = items.reduce((s, it) => s + it.unitPrice * it.quantity, 0);
      const discount = rand() < 0.08 ? Math.round(subtotal * (rand() * 0.15 + 0.05)) : 0;
      const afterDiscount = subtotal - discount;
      const tax = inclusive
        ? Math.round((afterDiscount * taxRate) / (100 + taxRate) * 100) / 100
        : Math.round((afterDiscount * taxRate) / 100 * 100) / 100;
      const total = inclusive ? afterDiscount : afterDiscount + tax;

      const customer = rand() < 0.7 ? pick(customers) : null;
      const orderType = pickOrderType();
      const table = orderType === 'DINE_IN' && tables.length ? pick(tables) : null;
      const cashier = pick(cashiers);
      const paymentMethod = pickPayment();
      const isRefunded = d > 2 && rand() < 0.03;
      const status = isRefunded ? 'REFUNDED' : 'COMPLETED';
      const orderNumber = `${seqPrefix}-${String(orderSeq++).padStart(5, '0')}`;

      if (customer) {
        const earned = Math.floor(total / 100);
        const existing = customerAgg[customer.id] ?? { spent: 0, visits: 0, points: 0, lastAt: orderTime };
        existing.spent += total;
        existing.visits += 1;
        existing.points += earned;
        if (orderTime > existing.lastAt) existing.lastAt = orderTime;
        customerAgg[customer.id] = existing;
      }

      specs.push({
        orderNumber,
        cashierId: cashier.id,
        customerId: customer?.id || null,
        tableId: table?.id || null,
        type: orderType,
        status,
        subtotal,
        discount,
        tax,
        total,
        paymentMethod,
        reference: paymentMethod !== 'CASH' ? `REF${randInt(100000, 999999)}` : null,
        createdAt: orderTime,
        items,
      });
    }
  }

  console.log(`📋 Built ${specs.length} order specs in memory. Inserting in batches of 50...`);

  // Insert with bounded concurrency to avoid overloading the Supabase pooler
  const CONCURRENCY = 10;
  let nextIdx = 0;
  const storeIdLocal = store.id; // capture non-null for closure
  async function worker() {
    while (nextIdx < specs.length) {
      const i = nextIdx++;
      const s = specs[i];
      try {
        await prisma.order.create({
          data: {
            orderNumber: s.orderNumber,
            storeId: storeIdLocal,
            cashierId: s.cashierId,
            customerId: s.customerId,
            tableId: s.tableId,
            type: s.type,
            status: s.status,
            subtotal: s.subtotal,
            discount: s.discount,
            tax: s.tax,
            serviceCharge: 0,
            total: s.total,
            createdAt: s.createdAt,
            items: {
              create: s.items.map((it) => ({
                productId: it.productId,
                quantity: it.quantity,
                unitPrice: it.unitPrice,
                discount: 0,
              })),
            },
            payments: {
              create: [
                {
                  method: s.paymentMethod,
                  amount: s.total,
                  reference: s.reference,
                },
              ],
            },
          },
        });
        totalCreated++;
        if (totalCreated % 100 === 0) {
          process.stdout.write(`   ${totalCreated}/${specs.length}\r`);
        }
      } catch (e: any) {
        if (!String(e?.message || '').includes('Unique')) {
          console.error('  Order create error:', e?.message?.split('\n')[0] || e);
        }
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

  // Apply customer aggregates
  console.log(`\n👥 Updating customer stats...`);
  for (const [customerId, agg] of Object.entries(customerAgg)) {
    try {
      await prisma.customer.update({
        where: { id: customerId },
        data: {
          totalSpent: agg.spent,
          visitCount: agg.visits,
          points: agg.points,
          lastVisitAt: agg.lastAt,
        },
      });
    } catch (e: any) {
      console.warn('  customer update skipped:', e?.message?.split('\n')[0] || e);
    }
  }

  // Restock products to a healthy level (so inventory isn't all zero from analytics).
  // Wrap in try/catch — this is best-effort and shouldn't fail the whole seed.
  try {
    console.log('📦 Topping up inventory...');
    await prisma.inventory.updateMany({
      where: { product: { storeId: store.id } },
      data: { quantity: 50 },
    });
  } catch (e: any) {
    console.warn('   (inventory topup skipped:', e?.message?.split('\n')[0] || e, ')');
  }

  console.log(`✅ Done! Created ${totalCreated} orders across ${DAYS + 1} days.`);
  console.log(`   Date range: ${new Date(today.getTime() - DAYS * 86400000).toDateString()} → ${today.toDateString()}`);
  console.log(`   Customers: ${customers.length}`);
  console.log('');
  console.log('💡 Now refresh:');
  console.log('   - POS Dashboard:    http://localhost:3000/dashboard');
  console.log('   - POS Reports:      http://localhost:3000/reports');
  console.log('   - Analytics:        http://localhost:3001');
}

main()
  .catch((e) => {
    console.error('❌ Mock seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
