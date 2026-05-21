import { Request, Response, NextFunction } from 'express';
import { Forbidden, Unauthorized } from '../utils/errors';

export const rbac = (...allowedRoles: string[]) =>
  (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(Unauthorized());
    if (!allowedRoles.includes(req.user.role)) {
      return next(Forbidden(`Required role: ${allowedRoles.join(' or ')}`));
    }
    next();
  };
