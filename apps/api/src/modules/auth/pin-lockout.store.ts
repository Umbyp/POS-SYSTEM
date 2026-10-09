import { prisma } from '../../config/prisma';
import type { LockoutEntry, LockoutStore } from './pin.logic';

/** Durable PinLockout storage — survives restarts and is shared across every API instance. */
export class PrismaLockoutStore implements LockoutStore {
  async get(key: string): Promise<LockoutEntry | null> {
    const row = await prisma.pinLockout.findUnique({ where: { userId: key } });
    if (!row) return null;
    return { fails: row.fails, lockedUntil: row.lockedUntil?.getTime() ?? 0 };
  }

  async set(key: string, entry: LockoutEntry): Promise<void> {
    await prisma.pinLockout.upsert({
      where: { userId: key },
      create: { userId: key, fails: entry.fails, lockedUntil: entry.lockedUntil ? new Date(entry.lockedUntil) : null },
      update: { fails: entry.fails, lockedUntil: entry.lockedUntil ? new Date(entry.lockedUntil) : null },
    });
  }

  async delete(key: string): Promise<void> {
    await prisma.pinLockout.deleteMany({ where: { userId: key } });
  }
}
