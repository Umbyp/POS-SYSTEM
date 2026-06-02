/**
 * ล้างข้อมูล mock / ทดสอบ ออกจากฐานข้อมูล
 * เหลือไว้แต่ config จริง (ร้าน, สินค้า, หมวดหมู่, โต๊ะ, ผู้ใช้) —
 * ลบเฉพาะข้อมูลการขาย (orders/payments) + ลูกค้าที่ถูก seed ขึ้นมาทดสอบ
 *
 * ⚠️  ลบ "ออเดอร์ทั้งหมด" — ใช้ตอนเพิ่ง deploy ยังไม่มียอดขายจริง (เริ่มนับใหม่จากศูนย์)
 *
 * วิธีใช้ (รันในเครื่อง — .env ชี้ไป Supabase ตัวเดียวกับ production):
 *   cd apps/api
 *   npm run db:clean-mock
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🧹 กำลังล้างข้อมูล mock/ทดสอบ...\n');

  // 1) ลบ payments ก่อน (ไม่มี cascade จาก order)
  const payments = await prisma.payment.deleteMany({});
  console.log(`  ✓ ลบ payments: ${payments.count}`);

  // 2) ลบ stock movements ที่ผูกกับออเดอร์ (การขาย/คืนของ)
  const sm = await prisma.stockMovement.deleteMany({ where: { orderId: { not: null } } });
  console.log(`  ✓ ลบ stock movements (จากการขาย): ${sm.count}`);

  // 3) ลบออเดอร์ทั้งหมด (OrderItem จะถูกลบตาม cascade)
  const orders = await prisma.order.deleteMany({});
  console.log(`  ✓ ลบ orders + order items: ${orders.count}`);

  // 4) ลบลูกค้าทดสอบ (ตอนนี้ไม่มี order อ้างถึงแล้ว)
  const customers = await prisma.customer.deleteMany({});
  console.log(`  ✓ ลบ customers (mock): ${customers.count}`);

  console.log('\n✅ เสร็จแล้ว — Analytics จะแสดงเฉพาะยอดขายจริงจากนี้ไป');
  console.log('⚠️  หมายเหตุ: สต็อกสินค้าถูกหักจากการขาย mock ไปแล้ว');
  console.log('   ถ้าตัวเลขสต็อกไม่ตรง ให้ไปปรับที่ POS → Inventory ได้เลย');
}

main()
  .catch((e) => {
    console.error('❌ ล้างข้อมูลไม่สำเร็จ:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
