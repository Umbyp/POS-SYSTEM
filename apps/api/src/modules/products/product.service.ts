import { prisma } from '../../config/prisma';
import { NotFound } from '../../utils/errors';
import { Prisma } from '@prisma/client';

// Standard include so the POS/menu always gets a product's attached option
// groups (with their options, ordered) alongside category/stock/legacy variants.
const PRODUCT_INCLUDE = {
  category: true,
  inventory: true,
  variants: true,
  optionGroups: {
    orderBy: { sortOrder: 'asc' as const },
    include: {
      group: { include: { options: { orderBy: { sortOrder: 'asc' as const } } } },
    },
  },
} satisfies Prisma.ProductInclude;

export async function list(storeId: string, query: { q?: string; categoryId?: string; includeIngredients?: boolean; limit?: number }) {
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
  const limit = Math.min(query.limit ?? 200, 500);
  return prisma.product.findMany({
    where,
    include: PRODUCT_INCLUDE,
    orderBy: { name: 'asc' },
    take: limit,
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
    include: PRODUCT_INCLUDE,
  });
  if (!p) throw NotFound('Product not found');
  return p;
}

export async function findByBarcode(storeId: string, barcode: string) {
  const p = await prisma.product.findFirst({
    where: { storeId, barcode, isActive: true },
    include: PRODUCT_INCLUDE,
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
      optionGroups: Array.isArray(input.optionGroupIds) && input.optionGroupIds.length
        ? { create: input.optionGroupIds.map((groupId: string, i: number) => ({ groupId, sortOrder: i })) }
        : undefined,
    },
    include: PRODUCT_INCLUDE,
  });
}

export async function update(id: string, input: any) {
  // Re-attach option groups only when the client explicitly sends the array
  // (so a plain rename doesn't wipe attachments).
  const reattach = Array.isArray(input.optionGroupIds)
    ? {
        deleteMany: {},
        create: input.optionGroupIds.map((groupId: string, i: number) => ({ groupId, sortOrder: i })),
      }
    : undefined;

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
      ...(reattach ? { optionGroups: reattach } : {}),
    },
    include: PRODUCT_INCLUDE,
  });
}

/* ---------------- Option groups (store-level, reusable) ---------------- */

const GROUP_INCLUDE = {
  options: { orderBy: { sortOrder: 'asc' as const } },
  _count: { select: { products: true } },
} satisfies Prisma.OptionGroupInclude;

export function listOptionGroups(storeId: string) {
  return prisma.optionGroup.findMany({
    where: { storeId, isActive: true },
    include: GROUP_INCLUDE,
    orderBy: { sortOrder: 'asc' },
  });
}

interface OptionInput { name: string; priceDelta?: number; isDefault?: boolean }
interface GroupInput {
  name: string;
  minSelect?: number;
  maxSelect?: number;
  sortOrder?: number;
  options: OptionInput[];
}

export function createOptionGroup(storeId: string, input: GroupInput) {
  return prisma.optionGroup.create({
    data: {
      storeId,
      name: input.name,
      minSelect: input.minSelect ?? 0,
      maxSelect: input.maxSelect ?? 1,
      sortOrder: input.sortOrder ?? 0,
      options: {
        create: input.options.map((o, i) => ({
          name: o.name,
          priceDelta: new Prisma.Decimal(o.priceDelta ?? 0),
          isDefault: o.isDefault ?? false,
          sortOrder: i,
        })),
      },
    },
    include: GROUP_INCLUDE,
  });
}

// Replace the whole group (name/limits + full option list) in one transaction.
export async function updateOptionGroup(storeId: string, id: string, input: GroupInput) {
  const existing = await prisma.optionGroup.findFirst({ where: { id, storeId } });
  if (!existing) throw NotFound('Option group not found');
  return prisma.$transaction(async (tx) => {
    await tx.option.deleteMany({ where: { groupId: id } });
    return tx.optionGroup.update({
      where: { id },
      data: {
        name: input.name,
        minSelect: input.minSelect ?? 0,
        maxSelect: input.maxSelect ?? 1,
        sortOrder: input.sortOrder ?? 0,
        options: {
          create: input.options.map((o, i) => ({
            name: o.name,
            priceDelta: new Prisma.Decimal(o.priceDelta ?? 0),
            isDefault: o.isDefault ?? false,
            sortOrder: i,
          })),
        },
      },
      include: GROUP_INCLUDE,
    });
  });
}

export async function deleteOptionGroup(storeId: string, id: string) {
  const existing = await prisma.optionGroup.findFirst({ where: { id, storeId } });
  if (!existing) throw NotFound('Option group not found');
  // soft-delete so historical order snapshots (stored as JSON) stay meaningful
  await prisma.optionGroup.update({ where: { id }, data: { isActive: false } });
}

export async function remove(id: string) {
  // soft delete
  return prisma.product.update({ where: { id }, data: { isActive: false } });
}
