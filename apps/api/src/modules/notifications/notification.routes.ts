import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth.middleware';
import { checkAnomaly } from './anomaly.service';

const router = Router();
router.use(authMiddleware);

// POST /notifications/check-anomaly — today's revenue vs 4-week baseline
router.post('/check-anomaly', async (req, res, next) => {
  try {
    const result = await checkAnomaly(req.user!.storeId);
    res.json(result);
  } catch (e) { next(e); }
});

export default router;
