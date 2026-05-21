import { Request, Response, NextFunction } from 'express';
import { verifyToken, JwtPayload } from '../utils/jwt';
import { Unauthorized } from '../utils/errors';

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

export function authMiddleware(req: Request, _res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw Unauthorized('No token provided');
    const token = header.slice(7);
    req.user = verifyToken(token);
    next();
  } catch (err: any) {
    next(Unauthorized(err.message || 'Invalid token'));
  }
}
