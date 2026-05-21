import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../../middleware/auth.middleware';
import { rbac } from '../../middleware/rbac.middleware';
import { validate } from '../../middleware/validate.middleware';
import * as line from './line.service';

const router = Router();
router.use(authMiddleware);

// POST /notifications/line/test
const testSchema = z.object({ token: z.string().min(10) });
router.post('/line/test', rbac('OWNER', 'ADMIN'), validate(testSchema), async (req, res, next) => {
  try {
    const result = await line.testToken(req.body.token);
    res.json(result);
  } catch (e) { next(e); }
});

// POST /notifications/line/daily-summary
router.post('/line/daily-summary', rbac('OWNER', 'ADMIN'), async (req, res, next) => {
  try {
    await line.sendDailySummary(req.user!.storeId);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// POST /notifications/check-anomaly
router.post('/check-anomaly', async (req, res, next) => {
  try {
    const result = await line.checkAnomaly(req.user!.storeId);
    res.json(result);
  } catch (e) { next(e); }
});

export default router;
