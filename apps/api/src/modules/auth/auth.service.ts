import bcrypt from 'bcryptjs';
import { prisma } from '../../config/prisma';
import { signToken } from '../../utils/jwt';
import { AppError, BadRequest, Unauthorized } from '../../utils/errors';
import { PinLockout, hashPin, isValidPin } from './pin.logic';
import { PrismaLockoutStore } from './pin-lockout.store';
import { env } from '../../config/env';
import { Role } from '@prisma/client';

// jose ships ESM-only; this project compiles to CommonJS, so it has to be
// loaded via a dynamic import (see utils/jwt.ts for the same pattern).
const jose = import('jose');

// Verifies Google ID tokens against Google's own published signing keys —
// no SDK needed, jose fetches + caches the JWKS itself.
const googleJwks = env.GOOGLE_CLIENT_ID
  ? jose.then(({ createRemoteJWKSet }) => createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs')))
  : null;

export async function login(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user?.password) throw Unauthorized('Invalid credentials');
  if (!user.isActive) throw Unauthorized('Account is disabled');
  const ok = await bcrypt.compare(password, user.password);
  if (!ok) throw Unauthorized('Invalid credentials');

  // log LOGIN (fire-and-forget — ไม่ block flow ถ้าพัง)
  prisma.activityLog
    .create({ data: { userId: user.id, action: 'LOGIN' } })
    .catch(() => {});

  return issueToken(user);
}

export async function register(input: { email: string; password: string; name: string; storeName: string }) {
  const exists = await prisma.user.findUnique({ where: { email: input.email } });
  if (exists) throw BadRequest('Email already exists');

  const hashedPwd = await bcrypt.hash(input.password, 10);

  // คนแรกที่สมัคร = สร้างร้านใหม่ + เป็น OWNER
  const result = await prisma.$transaction(async (tx) => {
    const store = await tx.store.create({
      data: { name: input.storeName, currency: 'THB', taxRate: 7 },
    });
    const user = await tx.user.create({
      data: {
        email: input.email,
        password: hashedPwd,
        name: input.name,
        role: Role.OWNER,
        storeId: store.id,
      },
    });
    // เพิ่มเข้า StoreMember (สำหรับ multi-store)
    await tx.storeMember.create({
      data: { userId: user.id, storeId: store.id, role: Role.OWNER },
    });
    return user;
  });

  return issueToken(result);
}

export async function googleLogin(idToken: string) {
  if (!env.GOOGLE_CLIENT_ID || !googleJwks) throw BadRequest('Google login not configured');

  let payload;
  try {
    const { jwtVerify } = await jose;
    const jwks = await googleJwks;
    ({ payload } = await jwtVerify(idToken, jwks, {
      issuer: ['https://accounts.google.com', 'accounts.google.com'],
      audience: env.GOOGLE_CLIENT_ID,
    }));
  } catch {
    throw Unauthorized('Invalid Google token');
  }
  const email = payload.email as string | undefined;
  if (!email) throw Unauthorized('Invalid Google token');

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw Unauthorized('User not registered. Please contact admin.');
  if (!user.isActive) throw Unauthorized('Account is disabled');

  // อัปเดต googleId ครั้งแรก
  if (!user.googleId) {
    await prisma.user.update({ where: { id: user.id }, data: { googleId: payload.sub } });
  }

  return issueToken(user);
}

const pinLockout = new PinLockout(new PrismaLockoutStore());
// valid bcrypt hash of a throwaway value — compared against when the target user
// is unknown so response time and message don't reveal whether the user exists
const DUMMY_HASH = bcrypt.hashSync('000000', 10);
const PIN_FAIL_MSG = 'PIN ไม่ถูกต้อง';

/** Active staff of the store who have a PIN — for the shift-PIN picker. */
export async function pinStaff(storeId: string) {
  return prisma.user.findMany({
    where: { storeId, isActive: true, pinHash: { not: null } },
    select: { id: true, name: true, role: true, avatar: true },
    orderBy: { name: 'asc' },
  });
}

/** storeId comes from the device's already-authenticated token, never the body. */
export async function pinLogin(storeId: string, userId: string, pin: string) {
  const locked = await pinLockout.lockedFor(userId);
  if (locked) {
    throw new AppError(429, `ลองผิดหลายครั้งเกินไป กรุณารออีก ${Math.ceil(locked / 60)} นาที`, 'PIN_LOCKED');
  }
  const user = await prisma.user.findFirst({ where: { id: userId, storeId } });
  const ok = await bcrypt.compare(pin, user?.pinHash ?? DUMMY_HASH);
  if (!user || !user.pinHash || !user.isActive || !ok) {
    await pinLockout.recordFailure(userId);
    // 403 (not 401): the mobile client logs the whole device out on 401
    throw new AppError(403, PIN_FAIL_MSG, 'INVALID_PIN');
  }
  await pinLockout.reset(userId);
  prisma.activityLog.create({ data: { userId: user.id, action: 'LOGIN' } }).catch(() => {});
  return issueToken(user);
}

export async function setPin(userId: string, pin: string | null) {
  if (pin !== null && !isValidPin(pin)) throw BadRequest('PIN ต้องเป็นตัวเลข 4-6 หลัก');
  await prisma.user.update({
    where: { id: userId },
    data: { pinHash: pin === null ? null : await hashPin(pin) },
  });
  await pinLockout.reset(userId);
}

export async function me(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { store: true },
  });
  if (!user) throw Unauthorized();
  const { password, ...safe } = user;
  return safe;
}

async function issueToken(user: { id: string; email: string; role: string; storeId: string; name: string }) {
  const token = await signToken({
    id: user.id,
    email: user.email,
    role: user.role,
    storeId: user.storeId,
  });
  return {
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      storeId: user.storeId,
    },
  };
}
