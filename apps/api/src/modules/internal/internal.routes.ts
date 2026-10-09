/**
 * Internal, server-to-server endpoints — not reachable by any end-user
 * client. Auth is a shared secret header (CRON_SECRET), not a user JWT:
 * there's no logged-in user behind a scheduled job.
 */
import { Router, type Request, type Response } from 'express';
import { env } from '../../config/env';
import { logger } from '../../utils/logger';
import { expireDuePoints } from '../loyalty/loyalty.service';

const router = Router();

function requireCronSecret(req: Request, res: Response): boolean {
  if (!env.CRON_SECRET || req.header('x-cron-secret') !== env.CRON_SECRET) {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }
  return true;
}

/**
 * POST /api/internal/expire-points
 *
 * Triggered by a Supabase pg_cron job (via pg_net) once a day — replaces the
 * old in-process `setInterval` in server.ts, so expiry no longer depends on
 * the API process staying alive for a full 24h stretch. expireDuePoints() is
 * idempotent (see loyalty.service.ts), so it's safe to call this more often
 * than scheduled, or concurrently from more than one API instance.
 */
router.post('/expire-points', async (req, res, next) => {
  try {
    if (!requireCronSecret(req, res)) return;
    const result = await expireDuePoints();
    if (result.points > 0) logger.info(result, 'expired loyalty points (cron)');
    res.json({ ok: true, ...result });
  } catch (e) {
    next(e);
  }
});

export default router;
