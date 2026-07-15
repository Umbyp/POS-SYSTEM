import { Router, type RequestHandler } from 'express';
import rateLimit from 'express-rate-limit';
import { authMiddleware } from '../../middleware/auth.middleware';
import * as service from './display.service';

// Cast: express-rate-limit@7 ships Express-5 handler types; runtime is Express 4
// (same pattern as self-order.routes.ts).
const readLimiter = rateLimit({
  windowMs: 60_000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
}) as unknown as RequestHandler;

/**
 * Public — no auth. A ready-board TV/kiosk in the shop (or a customer's own
 * phone) reads this to see which orders the kitchen has finished. Scoped by
 * storeId only; see display.service.ts for exactly what fields are exposed.
 */
const publicRouter = Router();

publicRouter.get('/store/:storeId/ready-board', readLimiter, async (req, res, next) => {
  try {
    res.json(await service.getReadyBoard(req.params.storeId));
  } catch (e) { next(e); }
});

/**
 * Relays a cashier's customer-display broadcast (live cart / QR / thank-you)
 * to every device watching that store's display — including a second
 * device on the LAN, via the unauthenticated `/display` socket namespace
 * (see socket.ts). The sender must be a logged-in staff member; the
 * message body is arbitrary, ephemeral UI state, never persisted.
 */
const router = Router();
router.use(authMiddleware);

router.post('/broadcast', (req, res) => {
  const io = req.app.get('io');
  io.of('/display').to(`store:${req.user!.storeId}:display`).emit('update', req.body);
  res.json({ ok: true });
});

export { publicRouter as displayPublicRouter, router as displayRouter };
