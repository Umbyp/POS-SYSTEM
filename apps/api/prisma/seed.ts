import { PrismaClient, Role, MovementType } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // ลบข้อมูลเดิม (ระวังตอน production)
await prisma.activityLog.deleteMany();

await prisma.stockMovement.deleteMany();
await prisma.payment.deleteMany();
await prisma.orderItem.deleteMany();
await prisma.order.deleteMany();
await prisma.inventory.deleteMany();
await prisma.productVariant.deleteMany();
await prisma.product.deleteMany();
await prisma.category.deleteMany();
await prisma.table.deleteMany();
await prisma.supplier.deleteMany();
await prisma.user.deleteMany();
await prisma.store.deleteMany();

  // 1. Store
  const store = await prisma.store.create({
    data: {
      name: 'My Café POS',
      address: '123 ถนนสุขุมวิท กรุงเทพฯ',
      phone: '02-123-4567',
      taxId: '0123456789012',
      currency: 'THB',
      taxRate: 7,
      serviceCharge: 0,
    },
  });

  // 2. Users
  const password = await bcrypt.hash('admin1234', 10);
  await prisma.user.createMany({
    data: [
      { email: 'owner@pos.local', password, name: 'เจ้าของร้าน', role: Role.OWNER, storeId: store.id },
      { email: 'admin@pos.local', password, name: 'ผู้จัดการ', role: Role.ADMIN, storeId: store.id },
      { email: 'cashier@pos.local', password, name: 'พนักงานแคชเชียร์', role: Role.CASHIER, storeId: store.id },
      { email: 'kitchen@pos.local', password, name: 'พ่อครัว', role: Role.KITCHEN, storeId: store.id },
    ],
  });

  // 3. Categories
  const catBeverage = await prisma.category.create({
    data: { name: 'เครื่องดื่ม', icon: '☕', color: '#7C4DFF', sortOrder: 1, storeId: store.id },
  });
  const catFood = await prisma.category.create({
    data: { name: 'อาหาร', icon: '🍔', color: '#00D4FF', sortOrder: 2, storeId: store.id },
  });
  const catDessert = await prisma.category.create({
    data: { name: 'ของหวาน', icon: '🍰', color: '#00C896', sortOrder: 3, storeId: store.id },
  });

  // 4. Products พร้อม inventory
  const products = [
    { name: 'Latte', sku: 'BEV-001', barcode: '8851001001001', cost: 30, price: 75, cat: catBeverage.id, qty: 100 },
    { name: 'Cappuccino', sku: 'BEV-002', barcode: '8851001001002', cost: 30, price: 70, cat: catBeverage.id, qty: 100 },
    { name: 'Americano', sku: 'BEV-003', barcode: '8851001001003', cost: 20, price: 60, cat: catBeverage.id, qty: 100 },
    { name: 'Espresso', sku: 'BEV-004', barcode: '8851001001004', cost: 15, price: 50, cat: catBeverage.id, qty: 100 },
    { name: 'Matcha Latte', sku: 'BEV-005', barcode: '8851001001005', cost: 40, price: 85, cat: catBeverage.id, qty: 80 },
    { name: 'Thai Tea', sku: 'BEV-006', barcode: '8851001001006', cost: 20, price: 55, cat: catBeverage.id, qty: 80 },
    { name: 'Cheeseburger', sku: 'FOOD-001', barcode: '8851002001001', cost: 60, price: 159, cat: catFood.id, qty: 50 },
    { name: 'Chicken Sandwich', sku: 'FOOD-002', barcode: '8851002001002', cost: 50, price: 139, cat: catFood.id, qty: 50 },
    { name: 'Caesar Salad', sku: 'FOOD-003', barcode: '8851002001003', cost: 70, price: 169, cat: catFood.id, qty: 30 },
    { name: 'Spaghetti Carbonara', sku: 'FOOD-004', barcode: '8851002001004', cost: 80, price: 189, cat: catFood.id, qty: 40 },
    { name: 'Tiramisu', sku: 'DES-001', barcode: '8851003001001', cost: 50, price: 129, cat: catDessert.id, qty: 25 },
    { name: 'Cheesecake', sku: 'DES-002', barcode: '8851003001002', cost: 55, price: 139, cat: catDessert.id, qty: 25 },
    { name: 'Brownie', sku: 'DES-003', barcode: '8851003001003', cost: 30, price: 89, cat: catDessert.id, qty: 30 },
  ];

  for (const p of products) {
    await prisma.product.create({
      data: {
        name: p.name,
        sku: p.sku,
        barcode: p.barcode,
        costPrice: p.cost,
        sellingPrice: p.price,
        categoryId: p.cat,
        storeId: store.id,
        inventory: { create: { quantity: p.qty, lowStockAt: 10 } },
      },
    });
  }

  // 5. Tables
  for (let i = 1; i <= 10; i++) {
    await prisma.table.create({
      data: { number: `T${String(i).padStart(2, '0')}`, capacity: i <= 5 ? 4 : 6, storeId: store.id },
    });
  }

  // 6. Supplier
  await prisma.supplier.create({
    data: {
      name: 'ABC Coffee Beans Co., Ltd.',
      contact: 'คุณสมชาย',
      phone: '081-234-5678',
      email: 'sales@abccoffee.co.th',
      storeId: store.id,
    },
  });

  console.log('✅ Seed completed!');
  console.log('\n📧 Login credentials:');
  console.log('   Owner:   owner@pos.local   / admin1234');
  console.log('   Admin:   admin@pos.local   / admin1234');
  console.log('   Cashier: cashier@pos.local / admin1234');
  console.log('   Kitchen: kitchen@pos.local / admin1234');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
