import { prisma } from '../../config/prisma';
import { NotFound } from '../../utils/errors';
import { Prisma } from '@prisma/client';

export async function list(storeId: string, query: { q?: string; categoryId?: string; includeIngredients?: boolean }) {
  const where: Prisma.ProductWhereInput = {
    storeId,
    isActive: true,
    ...(query.categoryId ? { categoryId: query.categoryId } : {}),
    ...(query.includeIngredients ? {} : { isIngredient: false }),
    ...(query.q
      ? {
          OR: [
            { name: { contains: query.q, mode: 'insensitive' } },
            { sku: { contains: query.q, mode: 'insensitive' } },
            { barcode: { contains: query.q } },
          ],
        }
      : {}),
  };
  return prisma.product.findMany({
    where,
    include: { category: true, inventory: true, variants: true },
    orderBy: { name: 'asc' },
  });
}

/**
 * คำนวณต้นทุนของสินค้าจาก recipe
 * คืน null ถ้าไม่มี recipe → ใช้ costPrice ที่ตั้งมือเอง
 */
export async function calculateRecipeCost(productId: string): Promise<number | null> {
  const recipe = await prisma.recipeItem.findMany({
    where: { productId },
    include: { ingredient: true },
  });
  if (recipe.length === 0) return null;
  return recipe.reduce(
    (sum, r) => sum + Number(r.quantity) * Number(r.ingredient.costPrice),
    0
  );
}

export async function getRecipe(productId: string) {
  return prisma.recipeItem.findMany({
    where: { productId },
    include: { ingredient: { include: { inventory: true } } },
  });
}

export async function setRecipe(
  productId: string,
  items: Array<{ ingredientId: string; quantity: number; unit?: string; notes?: string }>
) {
  return prisma.$transaction(async (tx) => {
    // ลบของเก่าทั้งหมด แล้วใส่ใหม่
    await tx.recipeItem.deleteMany({ where: { productId } });
    if (items.length === 0) return [];
    await tx.recipeItem.createMany({
      data: items.map((it) => ({
        productId,
        ingredientId: it.ingredientId,
        quantity: it.quantity,
        unit: it.unit || null,
        notes: it.notes || null,
      })),
    });

    // อัปเดท costPrice ของสินค้าจาก recipe (auto sync)
    const computedCost = await calculateRecipeCost(productId);
    if (computedCost != null) {
      await tx.product.update({
        where: { id: productId },
        data: { costPrice: new Prisma.Decimal(computedCost) },
      });
    }

    return tx.recipeItem.findMany({
      where: { productId },
      include: { ingredient: true },
    });
  });
}

export async function getById(id: string) {
  const p = await prisma.product.findUnique({
    where: { id },
    include: { category: true, inventory: true, variants: true },
  });
  if (!p) throw NotFound('Product not found');
  return p;
}

export async function findByBarcode(storeId: string, barcode: string) {
  const p = await prisma.product.findFirst({
    where: { storeId, barcode, isActive: true },
    include: { category: true, inventory: true, variants: true },
  });
  if (!p) throw NotFound('Product not found');
  return p;
}

export async function create(storeId: string, input: any) {
  return prisma.product.create({
    data: {
      name: input.name,
      sku: input.sku,
      barcode: input.barcode,
      description: input.description,
      image: input.image,
      costPrice: input.costPrice,
      sellingPrice: input.sellingPrice,
      categoryId: input.categoryId,
      storeId,
      trackStock: input.trackStock ?? true,
      isIngredient: input.isIngredient ?? false,
      isCombo: input.isCombo ?? false,
      inventory: input.trackStock !== false
        ? { create: { quantity: input.initialStock || 0, lowStockAt: input.lowStockAt || 10 } }
        : undefined,
      variants: input.variants?.length
        ? { create: input.variants }
        : undefined,
    },
    include: { category: true, inventory: true, variants: true },
  });
}

export async function update(id: string, input: any) {
  return prisma.product.update({
    where: { id },
    data: {
      name: input.name,
      sku: input.sku,
      barcode: input.barcode,
      description: input.description,
      image: input.image,
      costPrice: input.costPrice,
      sellingPrice: input.sellingPrice,
      categoryId: input.categoryId,
      isActive: input.isActive,
      isIngredient: input.isIngredient,
      isCombo: input.isCombo,
    },
    include: { category: true, inventory: true },
  });
}

export async function remove(id: string) {
  // soft delete
  return prisma.product.update({ where: { id }, data: { isActive: false } });
}
