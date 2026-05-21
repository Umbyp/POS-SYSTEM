import { Router } from 'express';
import { z } from 'zod';
import * as service from './auth.service';
import { authMiddleware } from '../../middleware/auth.middleware';
import { validate } from '../../middleware/validate.middleware';

const router = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});
const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().min(1),
  storeName: z.string().min(1),
});
const googleSchema = z.object({ idToken: z.string() });

router.post('/login', validate(loginSchema), async (req, res, next) => {
  try {
    res.json(await service.login(req.body.email, req.body.password));
  } catch (e) { next(e); }
});

router.post('/register', validate(registerSchema), async (req, res, next) => {
  try {
    res.status(201).json(await service.register(req.body));
  } catch (e) { next(e); }
});

router.post('/google', validate(googleSchema), async (req, res, next) => {
  try {
    res.json(await service.googleLogin(req.body.idToken));
  } catch (e) { next(e); }
});

router.get('/me', authMiddleware, async (req, res, next) => {
  try {
    res.json(await service.me(req.user!.id));
  } catch (e) { next(e); }
});

export default router;
