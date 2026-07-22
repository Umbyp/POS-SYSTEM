import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth.middleware';
import { rbac } from '../../middleware/rbac.middleware';
import { prisma } from '../../config/prisma';

const router = Router();
router.use(authMiddleware, rbac('OWNER', 'ADMIN'));

// GET /dashboard/overview - ภาพรวมร้านแบบ realtime
router.get('/overview', async (req, res, next) => {
  try {
    const storeId = req.user!.storeId;
    const now = new Date();
    const startOfToday = new Date(now); startOfToday.setHours(0, 0, 0, 0);
    const startOfYesterday = new Date(startOfToday.getTime() - 86400_000);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastWeek = new Date(now.getTime() - 7 * 86400_000);
    const startOfThirty = new Date(now.getTime() - 30 * 86400_000);

    const validStatus = { notIn: ['CANCELLED', 'REFUNDED', 'DRAFT'] as any };

    // ====== STORE INFO ======
    const store = await prisma.store.findUniqueOrThrow({
      where: { id: storeId },
      select: {
        name: true, priceIncludesTax: true, taxRate: true,
        dailyTarget: true, monthlyTarget: true,
      },
    });

    // ====== TODAY METRICS ======
    const [todayAgg, todayItemsAgg, costResult, topItemsResult, hourlyResult] = await Promise.all([
      prisma.order.aggregate({
        where: { storeId, createdAt: { gte: startOfToday }, status: validStatus },
        _sum: { total: true, tax: true },
        _count: { id: true },
      }),
      prisma.orderItem.aggregate({
        where: {
          order: { storeId, createdAt: { gte: startOfToday }, status: validStatus },
        },
        _sum: { quantity: true },
      }),
      prisma.$queryRaw<{ total_cost: number }[]>`
        SELECT COALESCE(SUM(p."costPrice" * oi.quantity), 0)::float AS total_cost
        FROM "OrderItem" oi
        JOIN "Order" o ON o.id = oi."orderId"
        JOIN "Product" p ON p.id = oi."productId"
        WHERE o."storeId" = ${storeId}
          AND o."createdAt" >= ${startOfToday}
          AND o.status NOT IN ('CANCELLED', 'REFUNDED', 'DRAFT')
      `,
      prisma.$queryRaw<{ name: string; qty: number; revenue: number }[]>`
        SELECT p.name, SUM(oi.quantity)::int as qty, SUM(oi."unitPrice" * oi.quantity)::float as revenue
        FROM "OrderItem" oi
        JOIN "Order" o ON o.id = oi."orderId"
        JOIN "Product" p ON p.id = oi."productId"
        WHERE o."storeId" = ${storeId}
          AND o."createdAt" >= ${startOfToday}
          AND o.status NOT IN ('CANCELLED', 'REFUNDED', 'DRAFT')
        GROUP BY p.id, p.name
        ORDER BY qty DESC
        LIMIT 5
      `,
      prisma.$queryRaw<{ hour: number; revenue: number; orders: number }[]>`
        SELECT EXTRACT(HOUR FROM "createdAt" AT TIME ZONE 'Asia/Bangkok')::int as hour,
          SUM(total)::float as revenue, COUNT(*)::int as orders
        FROM "Order"
        WHERE "storeId" = ${storeId}
          AND "createdAt" >= ${startOfToday}
          AND status NOT IN ('CANCELLED', 'REFUNDED', 'DRAFT')
        GROUP BY hour
      `,
    ]);

    // Profit today = revenue - cost
    const todayCost = Number(costResult[0]?.total_cost || 0);
    const todayRevenue = Number(todayAgg._sum.total || 0);
    const todayProfit = todayRevenue - todayCost;
    const todayMargin = todayRevenue > 0 ? (todayProfit / todayRevenue) * 100 : 0;

    // ====== YESTERDAY (for compare) ======
    const yAgg = await prisma.order.aggregate({
      where: {
        storeId,
        createdAt: { gte: startOfYesterday, lt: startOfToday },
        status: validStatus,
      },
      _sum: { total: true },
      _count: { id: true },
    });
    const yRevenue = Number(yAgg._sum.total || 0);
    const vsYesterdayPct = yRevenue > 0
      ? ((todayRevenue - yRevenue) / yRevenue) * 100
      : null;

    // ====== 7-DAY AVERAGE (for baseline) ======
    const sevenDayAgg = await prisma.order.aggregate({
      where: {
        storeId,
        createdAt: { gte: startOfLastWeek, lt: startOfToday },
        status: validStatus,
      },
      _sum: { total: true },
    });
    const sevenDayRevenue = Number(sevenDayAgg._sum.total || 0);
    const dailyAvg = sevenDayRevenue / 7;
    const vsAvgPct = dailyAvg > 0
      ? ((todayRevenue - dailyAvg) / dailyAvg) * 100
      : null;

    // ====== MONTH TO DATE ======
    const monthAgg = await prisma.order.aggregate({
      where: { storeId, createdAt: { gte: startOfMonth }, status: validStatus },
      _sum: { total: true },
      _count: { id: true },
    });
    const monthRevenue = Number(monthAgg._sum.total || 0);

    // ====== ALERTS ======
    const [lowStockItems, pendingOrders, activeTables, allTables] = await Promise.all([
      prisma.inventory.findMany({
        where: {
          product: { storeId, isActive: true, trackStock: true },
        },
        include: { product: { select: { id: true, name: true, isIngredient: true } } },
        orderBy: { quantity: 'asc' },
      }),
      prisma.order.count({
        where: { storeId, status: 'PENDING' },
      }),
      prisma.table.count({ where: { storeId, status: 'OCCUPIED' } }),
      prisma.table.count({ where: { storeId } }),
    ]);
    const low = lowStockItems.filter((i) => i.quantity <= i.lowStockAt).slice(0, 5);
    const outOfStock = lowStockItems.filter((i) => i.quantity === 0).length;

    // ====== TOP ITEMS TODAY ======
    const topItems = topItemsResult.map((t) => ({
      name: t.name,
      qty: Number(t.qty),
      revenue: Number(t.revenue),
    }));

    // ====== HOURLY TODAY ======
    const hourly: { hour: number; orders: number; revenue: number }[] = Array.from(
      { length: 24 },
      (_, h) => {
        const row = hourlyResult.find((r) => r.hour === h);
        return { hour: h, orders: row ? Number(row.orders) : 0, revenue: row ? Number(row.revenue) : 0 };
      }
    );

    // ====== RECENT ORDERS (live feed) ======
    const recentOrders = await prisma.order.findMany({
      where: { storeId, status: { notIn: ['DRAFT'] as any } },
      orderBy: { createdAt: 'desc' },
      take: 8,
      include: {
        cashier: { select: { name: true } },
        table: true,
        customer: { select: { name: true } },
        payments: true,
        items: { select: { id: true } },
      },
    });

    // ====== ACTIVE PROMOTIONS ======
    const activePromos = await prisma.promotion.findMany({
      where: {
        storeId,
        isActive: true,
        OR: [{ endAt: null }, { endAt: { gte: now } }],
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    // ====== CUSTOMER INSIGHTS ======
    const [newCustomersToday, totalCustomers] = await Promise.all([
      prisma.customer.count({
        where: { storeId, createdAt: { gte: startOfToday } },
      }),
      prisma.customer.count({ where: { storeId, isActive: true } }),
    ]);

    // ====== SMART INSIGHTS (auto narrative) ======
    const insights: { type: 'positive' | 'neutral' | 'warning' | 'critical'; text: string }[] = [];
    if (vsAvgPct != null && vsAvgPct > 20) {
      insights.push({
        type: 'positive',
        text: `🎉 วันนี้ขายดีกว่าค่าเฉลี่ย ${vsAvgPct.toFixed(0)}%`,
      });
    } else if (vsAvgPct != null && vsAvgPct < -20) {
      insights.push({
        type: 'warning',
        text: `📉 วันนี้ยอดต่ำกว่าค่าเฉลี่ย ${Math.abs(vsAvgPct).toFixed(0)}%`,
      });
    }
    if (topItems.length > 0) {
      insights.push({
        type: 'neutral',
        text: `⭐ ขายดีที่สุด: ${topItems[0].name} ${topItems[0].qty} ชิ้น`,
      });
    }
    if (low.length > 0) {
      insights.push({
        type: outOfStock > 0 ? 'critical' : 'warning',
        text: `📦 ${low.length} รายการสต็อกใกล้หมด${outOfStock > 0 ? ` (${outOfStock} หมดแล้ว)` : ''}`,
      });
    }
    if (todayMargin > 0 && todayMargin < 30) {
      insights.push({
        type: 'warning',
        text: `💰 กำไรขั้นต้นวันนี้ ${todayMargin.toFixed(0)}% — ค่อนข้างต่ำ`,
      });
    } else if (todayMargin >= 50) {
      insights.push({
        type: 'positive',
        text: `💰 กำไรขั้นต้น ${todayMargin.toFixed(0)}% — ดีมาก`,
      });
    }
    if (pendingOrders > 5) {
      insights.push({
        type: 'warning',
        text: `🍳 ครัวมีออเดอร์ค้าง ${pendingOrders} ออเดอร์`,
      });
    }

    // ====== GOAL PROGRESS ======
    const dailyTarget = Number(store.dailyTarget);
    const monthlyTarget = Number(store.monthlyTarget);
    const dailyPct = dailyTarget > 0 ? (todayRevenue / dailyTarget) * 100 : null;
    const monthlyPct = monthlyTarget > 0 ? (monthRevenue / monthlyTarget) * 100 : null;

    // Days passed in month for projection
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const dayOfMonth = now.getDate();
    const projection = monthRevenue / dayOfMonth * daysInMonth;

    res.json({
      storeName: store.name,
      today: {
        revenue: todayRevenue,
        cost: todayCost,
        profit: todayProfit,
        margin: todayMargin,
        orders: todayAgg._count.id,
        items: Number(todayItemsAgg._sum.quantity || 0),
        avgTicket: todayAgg._count.id > 0 ? todayRevenue / todayAgg._count.id : 0,
        vsYesterdayPct,
        vsAvgPct,
        yesterdayRevenue: yRevenue,
        dailyAvg,
      },
      month: {
        revenue: monthRevenue,
        orders: monthAgg._count.id,
        projection,
        dayOfMonth,
        daysInMonth,
      },
      goals: {
        dailyTarget,
        dailyActual: todayRevenue,
        dailyPct,
        monthlyTarget,
        monthlyActual: monthRevenue,
        monthlyPct,
      },
      restaurant: {
        activeTables,
        totalTables: allTables,
        pendingKitchen: pendingOrders,
      },
      alerts: {
        lowStock: low.map((i) => ({
          id: i.product.id,
          name: i.product.name,
          quantity: i.quantity,
          lowStockAt: i.lowStockAt,
          isIngredient: i.product.isIngredient,
        })),
        outOfStockCount: outOfStock,
      },
      topItems,
      hourly,
      recentOrders: recentOrders.map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        total: o.total,
        status: o.status,
        type: o.type,
        createdAt: o.createdAt,
        itemCount: o.items.length,
        cashierName: o.cashier?.name,
        tableNumber: o.table?.number,
        customerName: o.customer?.name,
        paymentMethod: o.payments[0]?.method,
      })),
      activePromotions: activePromos.map((p) => ({
        id: p.id,
        name: p.name,
        type: p.type,
        value: p.value,
        usageCount: p.usageCount,
        usageLimit: p.usageLimit,
      })),
      customers: {
        newToday: newCustomersToday,
        total: totalCustomers,
      },
      insights,
      generatedAt: now,
    });
  } catch (e) { next(e); }
});

export default router;
