import { env } from '../config/env';

export interface JwtPayload {
  id: string;
  email: string;
  role: string;
  storeId: string;
}

const secret = new TextEncoder().encode(env.JWT_SECRET);

// jose ships ESM-only; this project compiles to CommonJS, so it has to be
// loaded via a dynamic import. Node caches the module after the first call,
// so this isn't a repeated-disk-read cost on every request.
const jose = import('jose');

export async function signToken(payload: JwtPayload): Promise<string> {
  const { SignJWT } = await jose;
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(env.JWT_EXPIRES_IN)
    .sign(secret);
}

export async function verifyToken(token: string): Promise<JwtPayload> {
  const { jwtVerify } = await jose;
  const { payload } = await jwtVerify(token, secret);
  return payload as unknown as JwtPayload;
}
