import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth.middleware';
import { rbac } from '../../middleware/rbac.middleware';
import { prisma } from '../../config/prisma';
import { Prisma } from '@prisma/client';

const router = Router();
router.use(authMiddleware, rbac('OWNER', 'ADMIN'));

/** Helper — แยก period จาก query หรือใช้ default 30 วัน */
function getPeriod(query: any) {
  const to = query.to ? new Date(query.to as string) : new Date();
  const from = query.from
    ? new Date(query.from as string)
    : new Date(to.getTime() - 30 * 86400_000);
  return { from, to };
}

/** Helper — period ก่อนหน้าที่ความยาวเท่ากัน */
function getPrevPeriod(from: Date, to: Date) {
  const len = to.getTime() - from.getTime();
  return {
    from: new Date(from.getTime() - len),
    to: from,
  };
}

// GET /reports/summary?from=&to=
router.get('/summary', async (req, res, next) => {
  try {
    const storeId = req.user!.storeId;
    const { from, to } = getPeriod(req.query);
    const prev = getPrevPeriod(from, to);

    const where: Prisma.OrderWhereInput = {
      storeId,
      createdAt: { gte: from, lte: to },
      status: { notIn: ['CANCELLED', 'REFUNDED'] },
    };
    const wherePrev: Prisma.OrderWhereInput = {
      storeId,
      createdAt: { gte: prev.from, lte: prev.to },
      status: { notIn: ['CANCELLED', 'REFUNDED'] },
    };

    const [agg, count, prevAgg, prevCount] = await Promise.all([
      prisma.order.aggregate({
        where,
        _sum: { total: true, tax: true, discount: true, serviceCharge: true },
      }),
      prisma.order.count({ where }),
      prisma.order.aggregate({
        where: wherePrev,
        _sum: { total: true },
      }),
      prisma.order.count({ where: wherePrev }),
    ]);

    // จำนวนสินค้าที่ขายทั้งหมด
    const itemsAgg = await prisma.orderItem.aggregate({
      where: { order: where },
      _sum: { quantity: true },
    });

    // ===== กำไร: ดึง items พร้อม cost ของ product =====
    const itemsWithCost = await prisma.orderItem.findMany({
      where: { order: where },
      include: { product: { select: { costPrice: true, categoryId: true } } },
    });
    let totalCost = 0;
    const costByCategory = new Map<string, number>();
    const revenueByCategory = new Map<string, number>();
    for (const it of itemsWithCost) {
      const cost = Number(it.product.costPrice) * it.quantity;
      const rev = Number(it.unitPrice) * it.quantity;
      totalCost += cost;
      costByCategory.set(
        it.product.categoryId,
        (costByCategory.get(it.product.categoryId) || 0) + cost
      );
      revenueByCategory.set(
        it.product.categoryId,
        (revenueByCategory.get(it.product.categoryId) || 0) + rev
      );
    }
    const grossProfit = Number(agg._sum.total || 0) - totalCost;
    const profitMargin = Number(agg._sum.total || 0) > 0
      ? (grossProfit / Number(agg._sum.total || 0)) * 100
      : 0;

    // Top products (มี revenue ด้วย)
    const topProducts = await prisma.orderItem.groupBy({
      by: ['productId'],
      where: { order: where },
      _sum: { quantity: true },
      orderBy: { _sum: { quantity: 'desc' } },
      take: 10,
    });
    const products = await prisma.product.findMany({
      where: { id: { in: topProducts.map((t) => t.productId) } },
    });
    const topProductsDetail = await Promise.all(
      topProducts.map(async (tp) => {
        const p = products.find((p) => p.id === tp.productId);
        // คำนวณรายได้ของสินค้านี้
        const rev = await prisma.orderItem.aggregate({
          where: { productId: tp.productId, order: where },
          _sum: { quantity: true },
        });
        const lineRev = p ? Number(p.sellingPrice) * Number(rev._sum.quantity || 0) : 0;
        return {
          product: p,
          quantity: tp._sum.quantity,
          revenue: lineRev,
        };
      })
    );

    // Payment methods breakdown
    const payments = await prisma.payment.groupBy({
      by: ['method'],
      where: { order: where },
      _sum: { amount: true },
      _count: { id: true },
    });

    // Order types breakdown
    const orderTypes = await prisma.order.groupBy({
      by: ['type'],
      where,
      _sum: { total: true },
      _count: { id: true },
    });

    const revenue = Number(agg._sum.total || 0);
    const prevRevenue = Number(prevAgg._sum.total || 0);
    const revenueGrowth =
      prevRevenue > 0 ? ((revenue - prevRevenue) / prevRevenue) * 100 : null;
    const orderGrowth =
      prevCount > 0 ? ((count - prevCount) / prevCount) * 100 : null;
    const avgTicket = count > 0 ? revenue / count : 0;
    const prevAvg = prevCount > 0 ? prevRevenue / prevCount : 0;
    const avgGrowth = prevAvg > 0 ? ((avgTicket - prevAvg) / prevAvg) * 100 : null;

    res.json({
      revenue,
      cost: totalCost,
      grossProfit,
      profitMargin,
      tax: Number(agg._sum.tax || 0),
      discount: Number(agg._sum.discount || 0),
      serviceCharge: Number(agg._sum.serviceCharge || 0),
      orderCount: count,
      itemsSold: Number(itemsAgg._sum.quantity || 0),
      avgTicket,
      topProducts: topProductsDetail,
      paymentBreakdown: payments.map((p) => ({
        method: p.method,
        amount: Number(p._sum.amount || 0),
        count: p._count.id,
      })),
      orderTypeBreakdown: orderTypes.map((o) => ({
        type: o.type,
        amount: Number(o._sum.total || 0),
        count: o._count.id,
      })),
      previous: {
        revenue: prevRevenue,
        orderCount: prevCount,
        avgTicket: prevAvg,
      },
      growth: {
        revenue: revenueGrowth,
        orderCount: orderGrowth,
        avgTicket: avgGrowth,
      },
      period: { from, to },
    });
  } catch (e) { next(e); }
});

// GET /reports/daily-sales?from=&to=
router.get('/daily-sales', async (req, res, next) => {
  try {
    const { from, to } = getPeriod(req.query);
    const result = await prisma.$queryRaw<any[]>`
      SELECT
        DATE("createdAt") as date,
        SUM(total)::float as revenue,
        COUNT(*)::int as orders
      FROM "Order"
      WHERE "storeId" = ${req.user!.storeId}
        AND "createdAt" >= ${from}
        AND "createdAt" <= ${to}
        AND status NOT IN ('CANCELLED', 'REFUNDED')
      GROUP BY DATE("createdAt")
      ORDER BY date ASC
    `;
    res.json(result);
  } catch (e) { next(e); }
});

// GET /reports/hourly?from=&to=
router.get('/hourly', async (req, res, next) => {
  try {
    const { from, to } = getPeriod(req.query);
    const result = await prisma.$queryRaw<any[]>`
      SELECT
        EXTRACT(HOUR FROM "createdAt" AT TIME ZONE 'Asia/Bangkok')::int as hour,
        SUM(total)::float as revenue,
        COUNT(*)::int as orders
      FROM "Order"
      WHERE "storeId" = ${req.user!.storeId}
        AND "createdAt" >= ${from}
        AND "createdAt" <= ${to}
        AND status NOT IN ('CANCELLED', 'REFUNDED')
      GROUP BY hour
      ORDER BY hour ASC
    `;
    res.json(result);
  } catch (e) { next(e); }
});

// GET /reports/by-category?from=&to=
router.get('/by-category', async (req, res, next) => {
  try {
    const { from, to } = getPeriod(req.query);
    const result = await prisma.$queryRaw<any[]>`
      SELECT
        c.id,
        c.name,
        c.icon,
        SUM(oi.quantity)::int as quantity,
        SUM(oi."unitPrice" * oi.quantity)::float as revenue,
        SUM(p."costPrice" * oi.quantity)::float as cost,
        (SUM(oi."unitPrice" * oi.quantity) - SUM(p."costPrice" * oi.quantity))::float as profit
      FROM "OrderItem" oi
      JOIN "Order" o ON o.id = oi."orderId"
      JOIN "Product" p ON p.id = oi."productId"
      JOIN "Category" c ON c.id = p."categoryId"
      WHERE o."storeId" = ${req.user!.storeId}
        AND o."createdAt" >= ${from}
        AND o."createdAt" <= ${to}
        AND o.status NOT IN ('CANCELLED', 'REFUNDED')
      GROUP BY c.id, c.name, c.icon
      ORDER BY revenue DESC
    `;
    res.json(result);
  } catch (e) { next(e); }
});

// GET /reports/top-profitable?from=&to= - สินค้ากำไรสูงสุด (ไม่ใช่แค่ขายดี)
router.get('/top-profitable', async (req, res, next) => {
  try {
    const { from, to } = getPeriod(req.query);
    const result = await prisma.$queryRaw<any[]>`
      SELECT
        p.id,
        p.name,
        p.image,
        SUM(oi.quantity)::int as quantity,
        SUM(oi."unitPrice" * oi.quantity)::float as revenue,
        SUM(p."costPrice" * oi.quantity)::float as cost,
        (SUM(oi."unitPrice" * oi.quantity) - SUM(p."costPrice" * oi.quantity))::float as profit,
        CASE
          WHEN SUM(oi."unitPrice" * oi.quantity) > 0
          THEN ((SUM(oi."unitPrice" * oi.quantity) - SUM(p."costPrice" * oi.quantity)) / SUM(oi."unitPrice" * oi.quantity) * 100)::float
          ELSE 0
        END as margin
      FROM "OrderItem" oi
      JOIN "Order" o ON o.id = oi."orderId"
      JOIN "Product" p ON p.id = oi."productId"
      WHERE o."storeId" = ${req.user!.storeId}
        AND o."createdAt" >= ${from}
        AND o."createdAt" <= ${to}
        AND o.status NOT IN ('CANCELLED', 'REFUNDED')
      GROUP BY p.id, p.name, p.image
      ORDER BY profit DESC
      LIMIT 10
    `;
    res.json(result);
  } catch (e) { next(e); }
});

// GET /reports/day-of-week?days=90 - heatmap วันx ชม. รวม
router.get('/day-of-week', async (req, res, next) => {
  try {
    const days = Math.min(Number(req.query.days) || 90, 365);
    const result = await prisma.$queryRaw<any[]>`
      SELECT
        EXTRACT(DOW  FROM "createdAt" AT TIME ZONE 'Asia/Bangkok')::int as dow,
        EXTRACT(HOUR FROM "createdAt" AT TIME ZONE 'Asia/Bangkok')::int as hour,
        SUM(total)::float as revenue,
        COUNT(*)::int as orders
      FROM "Order"
      WHERE "storeId" = ${req.user!.storeId}
        AND "createdAt" >= NOW() - INTERVAL '1 day' * ${days}
        AND status NOT IN ('CANCELLED', 'REFUNDED', 'DRAFT')
      GROUP BY dow, hour
      ORDER BY dow, hour
    `;
    res.json(result);
  } catch (e) { next(e); }
});

// GET /reports/dead-stock?days=30 - สินค้าที่ไม่ขาย N วัน
router.get('/dead-stock', async (req, res, next) => {
  try {
    const days = Math.min(Number(req.query.days) || 30, 365);
    const result = await prisma.$queryRaw<any[]>`
      SELECT
        p.id,
        p.name,
        p.sku,
        p."sellingPrice"::float as "sellingPrice",
        p."costPrice"::float as "costPrice",
        c.name as category,
        c.icon as "categoryIcon",
        inv.quantity,
        inv.quantity * p."costPrice"::float as "tiedUpCost",
        COALESCE(last_sale.last_sold, NULL) as "lastSoldAt",
        COALESCE(EXTRACT(DAY FROM NOW() - last_sale.last_sold)::int, ${days}) as "daysSinceSale"
      FROM "Product" p
      JOIN "Category" c ON c.id = p."categoryId"
      LEFT JOIN "Inventory" inv ON inv."productId" = p.id
      LEFT JOIN (
        SELECT oi."productId", MAX(o."createdAt") as last_sold
        FROM "OrderItem" oi
        JOIN "Order" o ON o.id = oi."orderId"
        WHERE o.status NOT IN ('CANCELLED', 'REFUNDED', 'DRAFT')
        GROUP BY oi."productId"
      ) last_sale ON last_sale."productId" = p.id
      WHERE p."storeId" = ${req.user!.storeId}
        AND p."isActive" = true
        AND p."isIngredient" = false
        AND p."isCombo" = false
        AND p."trackStock" = true
        AND COALESCE(inv.quantity, 0) > 0
        AND (
          last_sale.last_sold IS NULL
          OR last_sale.last_sold < NOW() - INTERVAL '1 day' * ${days}
        )
      ORDER BY "tiedUpCost" DESC NULLS LAST
      LIMIT 50
    `;
    res.json(result);
  } catch (e) { next(e); }
});

// GET /reports/promotion-roi?from=&to= - ผลตอบแทนแต่ละโปร
router.get('/promotion-roi', async (req, res, next) => {
  try {
    const { from, to } = getPeriod(req.query);
    const result = await prisma.$queryRaw<any[]>`
      SELECT
        p.id,
        p.name,
        p.type::text as type,
        p."usageCount" as "totalUsage",
        COUNT(o.id)::int as "ordersUsed",
        COALESCE(SUM(o.total), 0)::float as revenue,
        COALESCE(SUM(o."promotionDiscount"), 0)::float as "totalDiscount",
        COALESCE(AVG(o.total), 0)::float as "avgOrderValue"
      FROM "Promotion" p
      LEFT JOIN "Order" o ON o."promotionId" = p.id
        AND o."createdAt" >= ${from}
        AND o."createdAt" <= ${to}
        AND o.status NOT IN ('CANCELLED', 'REFUNDED', 'DRAFT')
      WHERE p."storeId" = ${req.user!.storeId}
      GROUP BY p.id, p.name, p.type
      ORDER BY revenue DESC
    `;
    res.json(result);
  } catch (e) { next(e); }
});

// GET /reports/cashier-performance?from=&to=
router.get('/cashier-performance', async (req, res, next) => {
  try {
    const { from, to } = getPeriod(req.query);
    const data = await prisma.order.groupBy({
      by: ['cashierId'],
      where: {
        storeId: req.user!.storeId,
        createdAt: { gte: from, lte: to },
        status: { notIn: ['CANCELLED', 'REFUNDED'] },
      },
      _sum: { total: true },
      _count: { id: true },
      orderBy: { _sum: { total: 'desc' } },
    });
    const users = await prisma.user.findMany({
      where: { id: { in: data.map((d) => d.cashierId) } },
      select: { id: true, name: true, email: true, role: true },
    });
    res.json(
      data.map((d) => ({
        cashier: users.find((u) => u.id === d.cashierId),
        revenue: Number(d._sum.total || 0),
        orderCount: d._count.id,
      }))
    );
  } catch (e) { next(e); }
});

export default router;
