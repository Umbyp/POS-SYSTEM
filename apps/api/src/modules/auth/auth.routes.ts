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

const pinSchema = z.object({ pin: z.string().regex(/^\d{4,6}$/, 'PIN ต้องเป็นตัวเลข 4-6 หลัก') });
const pinLoginSchema = z.object({ userId: z.string().min(1), pin: z.string().min(1).max(12) });

// Shift-PIN: requires the device's existing login token; the store is taken from it.
router.get('/pin-staff', authMiddleware, async (req, res, next) => {
  try {
    res.json(await service.pinStaff(req.user!.storeId));
  } catch (e) { next(e); }
});

router.post('/pin-login', authMiddleware, validate(pinLoginSchema), async (req, res, next) => {
  try {
    res.json(await service.pinLogin(req.user!.storeId, req.body.userId, req.body.pin));
  } catch (e) { next(e); }
});

// Set / clear my own PIN
router.put('/pin', authMiddleware, validate(pinSchema), async (req, res, next) => {
  try {
    await service.setPin(req.user!.id, req.body.pin);
    res.json({ ok: true });
  } catch (e) { next(e); }
});
router.delete('/pin', authMiddleware, async (req, res, next) => {
  try {
    await service.setPin(req.user!.id, null);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.get('/me', authMiddleware, async (req, res, next) => {
  try {
    res.json(await service.me(req.user!.id));
  } catch (e) { next(e); }
});

export default router;
