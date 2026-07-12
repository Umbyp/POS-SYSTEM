import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth.middleware';

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

export default router;
