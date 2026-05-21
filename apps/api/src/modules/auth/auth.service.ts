import bcrypt from 'bcrypt';
import { OAuth2Client } from 'google-auth-library';
import { prisma } from '../../config/prisma';
import { signToken } from '../../utils/jwt';
import { BadRequest, Unauthorized } from '../../utils/errors';
import { env } from '../../config/env';
import { Role } from '@prisma/client';

const googleClient = env.GOOGLE_CLIENT_ID ? new OAuth2Client(env.GOOGLE_CLIENT_ID) : null;

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
  if (!googleClient) throw BadRequest('Google login not configured');

  const ticket = await googleClient.verifyIdToken({
    idToken,
    audience: env.GOOGLE_CLIENT_ID,
  });
  const payload = ticket.getPayload();
  if (!payload?.email) throw Unauthorized('Invalid Google token');

  const user = await prisma.user.findUnique({ where: { email: payload.email } });
  if (!user) throw Unauthorized('User not registered. Please contact admin.');
  if (!user.isActive) throw Unauthorized('Account is disabled');

  // อัปเดต googleId ครั้งแรก
  if (!user.googleId) {
    await prisma.user.update({ where: { id: user.id }, data: { googleId: payload.sub } });
  }

  return issueToken(user);
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

function issueToken(user: { id: string; email: string; role: string; storeId: string; name: string }) {
  const token = signToken({
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
