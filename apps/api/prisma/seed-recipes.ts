/**
 * Seed Recipes — เพิ่มวัตถุดิบ + เมนู + สูตรการผลิตให้ร้านแรก
 *
 * รันด้วย:
 *   cd apps/api
 *   npx tsx prisma/seed-recipes.ts
 *
 * - Idempotent — รันซ้ำได้, จะ upsert ตาม SKU
 * - ไม่ลบข้อมูลเดิม — เพิ่มของใหม่/อัปเดทเท่านั้น
 * - อัปเดท costPrice ของเมนูจากสูตรอัตโนมัติ
 */
import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

// ==================== วัตถุดิบ ====================
// cost = ต้นทุนต่อ 1 หน่วย (กรัม / มล. / ชิ้น)
const INGREDIENTS = [
  { sku: 'ING-ARABICA',   name: 'เมล็ดกาแฟ Arabica',  cost: 0.50, unit: 'กรัม', stock: 5000 },
  { sku: 'ING-ROBUSTA',   name: 'เมล็ดกาแฟ Robusta',  cost: 0.30, unit: 'กรัม', stock: 5000 },
  { sku: 'ING-MILK',      name: 'นมสด UHT',          cost: 0.08, unit: 'มล.',  stock: 20000 },
  { sku: 'ING-CONDMILK',  name: 'นมข้นหวาน',         cost: 0.10, unit: 'กรัม', stock: 5000 },
  { sku: 'ING-SUGAR',     name: 'น้ำตาลทราย',        cost: 0.05, unit: 'กรัม', stock: 10000 },
  { sku: 'ING-BROWNSUGAR',name: 'น้ำตาลทรายแดง',     cost: 0.08, unit: 'กรัม', stock: 5000 },
  { sku: 'ING-COCOA',     name: 'ผงโกโก้',           cost: 0.50, unit: 'กรัม', stock: 2000 },
  { sku: 'ING-MATCHA',    name: 'ผงชาเขียว Matcha',  cost: 1.20, unit: 'กรัม', stock: 1000 },
  { sku: 'ING-BLACKTEA',  name: 'ใบชาดำ',            cost: 0.40, unit: 'กรัม', stock: 2000 },
  { sku: 'ING-VANILLA',   name: 'น้ำเชื่อม Vanilla',  cost: 0.30, unit: 'มล.',  stock: 3000 },
  { sku: 'ING-HAZELNUT',  name: 'น้ำเชื่อม Hazelnut', cost: 0.30, unit: 'มล.',  stock: 3000 },
  { sku: 'ING-ICE',       name: 'น้ำแข็ง',           cost: 0.005, unit: 'กรัม', stock: 50000 },
  { sku: 'ING-WHIP',      name: 'ครีมวิปปิ้ง',        cost: 0.40, unit: 'มล.',  stock: 3000 },
  { sku: 'ING-FOAM',      name: 'ผงนม Foam',         cost: 0.80, unit: 'กรัม', stock: 1500 },
  { sku: 'ING-CHOCCHIP',  name: 'ช็อกโกแลตชิป',      cost: 0.60, unit: 'กรัม', stock: 2000 },
  { sku: 'ING-CUP',       name: 'แก้วพลาสติก+ฝา',    cost: 3.00, unit: 'ชิ้น', stock: 1000 },
];

// ==================== เมนู + สูตร ====================
// each item.recipe = [{ ingredientSku, qty, unit? }]
const MENU_WITH_RECIPE = [
  {
    sku: 'MENU-ESPRESSO',
    name: 'เอสเปรสโซ',
    price: 50,
    recipe: [{ sku: 'ING-ARABICA', qty: 18, unit: 'กรัม' }],
  },
  {
    sku: 'MENU-AMERICANO',
    name: 'อเมริกาโน่ (ร้อน)',
    price: 60,
    recipe: [
      { sku: 'ING-ARABICA', qty: 18, unit: 'กรัม' },
    ],
  },
  {
    sku: 'MENU-AMERICANO-ICE',
    name: 'อเมริกาโน่ (เย็น)',
    price: 65,
    recipe: [
      { sku: 'ING-ARABICA', qty: 18, unit: 'กรัม' },
      { sku: 'ING-ICE', qty: 80, unit: 'กรัม' },
      { sku: 'ING-CUP', qty: 1, unit: 'ชิ้น' },
    ],
  },
  {
    sku: 'MENU-LATTE-HOT',
    name: 'ลาเต้ (ร้อน)',
    price: 75,
    recipe: [
      { sku: 'ING-ARABICA', qty: 18, unit: 'กรัม' },
      { sku: 'ING-MILK', qty: 200, unit: 'มล.' },
    ],
  },
  {
    sku: 'MENU-LATTE-ICE',
    name: 'ลาเต้ (เย็น)',
    price: 80,
    recipe: [
      { sku: 'ING-ARABICA', qty: 18, unit: 'กรัม' },
      { sku: 'ING-MILK', qty: 150, unit: 'มล.' },
      { sku: 'ING-ICE', qty: 80, unit: 'กรัม' },
      { sku: 'ING-CUP', qty: 1, unit: 'ชิ้น' },
    ],
  },
  {
    sku: 'MENU-CAPPUCCINO',
    name: 'คาปูชิโน่',
    price: 70,
    recipe: [
      { sku: 'ING-ARABICA', qty: 18, unit: 'กรัม' },
      { sku: 'ING-MILK', qty: 150, unit: 'มล.' },
      { sku: 'ING-FOAM', qty: 5, unit: 'กรัม' },
    ],
  },
  {
    sku: 'MENU-MOCHA-ICE',
    name: 'มอคค่า (เย็น)',
    price: 85,
    recipe: [
      { sku: 'ING-ARABICA', qty: 18, unit: 'กรัม' },
      { sku: 'ING-MILK', qty: 150, unit: 'มล.' },
      { sku: 'ING-COCOA', qty: 15, unit: 'กรัม' },
      { sku: 'ING-WHIP', qty: 30, unit: 'มล.' },
      { sku: 'ING-ICE', qty: 80, unit: 'กรัม' },
      { sku: 'ING-CUP', qty: 1, unit: 'ชิ้น' },
    ],
  },
  {
    sku: 'MENU-MATCHA-LATTE',
    name: 'ชาเขียวมัทฉะลาเต้',
    price: 95,
    recipe: [
      { sku: 'ING-MATCHA', qty: 8, unit: 'กรัม' },
      { sku: 'ING-MILK', qty: 200, unit: 'มล.' },
      { sku: 'ING-SUGAR', qty: 10, unit: 'กรัม' },
      { sku: 'ING-ICE', qty: 80, unit: 'กรัม' },
      { sku: 'ING-CUP', qty: 1, unit: 'ชิ้น' },
    ],
  },
  {
    sku: 'MENU-THAITEA',
    name: 'ชาไทยเย็น',
    price: 55,
    recipe: [
      { sku: 'ING-BLACKTEA', qty: 8, unit: 'กรัม' },
      { sku: 'ING-CONDMILK', qty: 30, unit: 'กรัม' },
      { sku: 'ING-SUGAR', qty: 10, unit: 'กรัม' },
      { sku: 'ING-ICE', qty: 80, unit: 'กรัม' },
      { sku: 'ING-CUP', qty: 1, unit: 'ชิ้น' },
    ],
  },
  {
    sku: 'MENU-CHOCOLATE',
    name: 'ช็อกโกแลตเย็น',
    price: 75,
    recipe: [
      { sku: 'ING-COCOA', qty: 25, unit: 'กรัม' },
      { sku: 'ING-MILK', qty: 200, unit: 'มล.' },
      { sku: 'ING-SUGAR', qty: 10, unit: 'กรัม' },
      { sku: 'ING-WHIP', qty: 30, unit: 'มล.' },
      { sku: 'ING-CHOCCHIP', qty: 5, unit: 'กรัม' },
      { sku: 'ING-ICE', qty: 80, unit: 'กรัม' },
      { sku: 'ING-CUP', qty: 1, unit: 'ชิ้น' },
    ],
  },
  {
    sku: 'MENU-HAZELNUT-LATTE',
    name: 'ฮาเซลนัทลาเต้ (เย็น)',
    price: 90,
    recipe: [
      { sku: 'ING-ARABICA', qty: 18, unit: 'กรัม' },
      { sku: 'ING-MILK', qty: 150, unit: 'มล.' },
      { sku: 'ING-HAZELNUT', qty: 20, unit: 'มล.' },
      { sku: 'ING-ICE', qty: 80, unit: 'กรัม' },
      { sku: 'ING-CUP', qty: 1, unit: 'ชิ้น' },
    ],
  },
  {
    sku: 'MENU-VANILLA-LATTE',
    name: 'วานิลาลาเต้ (เย็น)',
    price: 85,
    recipe: [
      { sku: 'ING-ARABICA', qty: 18, unit: 'กรัม' },
      { sku: 'ING-MILK', qty: 150, unit: 'มล.' },
      { sku: 'ING-VANILLA', qty: 20, unit: 'มล.' },
      { sku: 'ING-ICE', qty: 80, unit: 'กรัม' },
      { sku: 'ING-CUP', qty: 1, unit: 'ชิ้น' },
    ],
  },
];

async function main() {
  console.log('🌱 Seeding recipes & ingredients...\n');

  // หา store แรก
  const store = await prisma.store.findFirst();
  if (!store) {
    console.error('❌ ไม่พบ Store — รัน seed.ts ก่อน');
    process.exit(1);
  }
  console.log(`📦 Store: ${store.name} (${store.id})`);

  // 1. สร้าง/หา category สำหรับวัตถุดิบ + เครื่องดื่ม
  const findOrCreateCategory = async (
    name: string,
    icon: string,
    color: string,
    sortOrder: number
  ) => {
    const existing = await prisma.category.findFirst({
      where: { storeId: store.id, name },
    });
    if (existing) return existing;
    return prisma.category.create({
      data: { name, icon, color, sortOrder, storeId: store.id },
    });
  };

  const ingredientCat = await findOrCreateCategory('วัตถุดิบ', '🥫', '#FFB020', 99);
  const beverageCat = await findOrCreateCategory('เครื่องดื่ม', '☕', '#7C4DFF', 1);

  console.log(`📁 Categories: ${ingredientCat.name}, ${beverageCat.name}`);

  // 2. Upsert ingredients
  console.log(`\n🥫 Seeding ${INGREDIENTS.length} ingredients...`);
  for (const ing of INGREDIENTS) {
    const existing = await prisma.product.findFirst({
      where: { sku: ing.sku, storeId: store.id },
    });
    if (existing) {
      await prisma.product.update({
        where: { id: existing.id },
        data: {
          name: ing.name,
          costPrice: ing.cost,
          isIngredient: true,
          categoryId: ingredientCat.id,
        },
      });
      console.log(`  ↻ ${ing.name} (${ing.sku}) — ${ing.cost}/${ing.unit}`);
    } else {
      await prisma.product.create({
        data: {
          name: ing.name,
          sku: ing.sku,
          costPrice: ing.cost,
          sellingPrice: 0,
          categoryId: ingredientCat.id,
          storeId: store.id,
          trackStock: true,
          isIngredient: true,
          inventory: { create: { quantity: ing.stock, lowStockAt: Math.floor(ing.stock * 0.1) } },
        },
      });
      console.log(`  ＋ ${ing.name} (${ing.sku}) — ${ing.cost}/${ing.unit} · สต็อก ${ing.stock}`);
    }
  }

  // 3. Upsert menu items + recipes
  console.log(`\n☕ Seeding ${MENU_WITH_RECIPE.length} menu items with recipes...`);
  for (const m of MENU_WITH_RECIPE) {
    // คำนวณ cost ก่อน (เพราะอาจไม่มี recipe rows)
    let computedCost = 0;
    const recipeRows: any[] = [];
    for (const r of m.recipe) {
      const ing = await prisma.product.findFirst({
        where: { sku: r.sku, storeId: store.id },
      });
      if (!ing) {
        console.warn(`  ⚠️ ${m.name}: ไม่พบวัตถุดิบ ${r.sku} — ข้าม`);
        continue;
      }
      computedCost += Number(ing.costPrice) * r.qty;
      recipeRows.push({
        ingredientId: ing.id,
        quantity: new Prisma.Decimal(r.qty),
        unit: r.unit,
      });
    }

    let product = await prisma.product.findFirst({
      where: { sku: m.sku, storeId: store.id },
    });
    if (product) {
      await prisma.product.update({
        where: { id: product.id },
        data: {
          name: m.name,
          sellingPrice: m.price,
          costPrice: computedCost,
          categoryId: beverageCat.id,
          isIngredient: false,
          trackStock: false,
        },
      });
    } else {
      product = await prisma.product.create({
        data: {
          name: m.name,
          sku: m.sku,
          costPrice: computedCost,
          sellingPrice: m.price,
          categoryId: beverageCat.id,
          storeId: store.id,
          trackStock: false,
          isIngredient: false,
        },
      });
    }

    // ลบ recipe เก่า + ใส่ใหม่
    await prisma.recipeItem.deleteMany({ where: { productId: product.id } });
    if (recipeRows.length > 0) {
      await prisma.recipeItem.createMany({
        data: recipeRows.map((r) => ({ ...r, productId: product!.id })),
      });
    }

    const margin = ((m.price - computedCost) / m.price) * 100;
    console.log(
      `  ✅ ${m.name.padEnd(28)} · ราคา ${m.price.toString().padStart(3)} · ต้นทุน ${computedCost.toFixed(2).padStart(6)} · กำไร ${margin.toFixed(1)}%`
    );
  }

  console.log('\n🎉 Seed completed!\n');
  console.log('ตัวอย่างที่ได้:');
  console.log(`  • วัตถุดิบ ${INGREDIENTS.length} รายการ (มีสต็อกเริ่มต้น)`);
  console.log(`  • เมนูเครื่องดื่มที่มีสูตร ${MENU_WITH_RECIPE.length} รายการ`);
  console.log('  • ต้นทุนเมนูถูกคำนวณจากสูตรอัตโนมัติ');
  console.log('\nลองเข้า /products → คลิกเมนูใดๆ → ดู section "สูตรการผลิต (BOM)"');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
