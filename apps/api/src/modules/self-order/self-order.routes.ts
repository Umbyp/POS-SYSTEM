import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../../middleware/auth.middleware';
import { validate } from '../../middleware/validate.middleware';
import * as service from './self-order.service';

const itemSchema = z.object({
  productId: z.string(),
  quantity: z.number().int().positive(),
  notes: z.string().optional(),
});

const submitSchema = z.object({
  items: z.array(itemSchema).min(1),
  note: z.string().optional(),
});

const rejectSchema = z.object({
  reason: z.string().optional(),
});

/**
 * Public — no auth. Reached by a customer's phone via the table's QR link.
 * Scoped entirely by the opaque `qrCode` token; never exposes internal IDs
 * or anything beyond the store's public menu.
 */
const publicRouter = Router();

publicRouter.get('/menu/:qrCode', async (req, res, next) => {
  try {
    const menu = await service.getMenu(req.params.qrCode);
    res.json(menu);
  } catch (e) { next(e); }
});

publicRouter.post('/:qrCode/submit', validate(submitSchema), async (req, res, next) => {
  try {
    const io = req.app.get('io');
    const request = await service.submitRequest(req.params.qrCode, req.body, io);
    res.status(201).json({ id: request.id });
  } catch (e) { next(e); }
});

publicRouter.get('/status/:id', async (req, res, next) => {
  try {
    const status = await service.getStatus(req.params.id);
    if (!status) return res.status(404).json({ error: 'Not found' });
    res.json(status);
  } catch (e) { next(e); }
});

publicRouter.post('/:qrCode/call-bill', async (req, res, next) => {
  try {
    const io = req.app.get('io');
    const request = await service.callForBill(req.params.qrCode, io);
    res.status(201).json({ id: request.id });
  } catch (e) { next(e); }
});

/** Staff-side — authenticated, scoped to the cashier's own store. */
const router = Router();
router.use(authMiddleware);

router.get('/pending', async (req, res, next) => {
  try {
    const pending = await service.listPending(req.user!.storeId);
    res.json(pending);
  } catch (e) { next(e); }
});

router.post('/:id/approve', async (req, res, next) => {
  try {
    const io = req.app.get('io');
    const updated = await service.approve(
      req.params.id,
      { storeId: req.user!.storeId, cashierId: req.user!.id },
      io
    );
    res.json(updated);
  } catch (e) { next(e); }
});

router.post('/:id/reject', validate(rejectSchema), async (req, res, next) => {
  try {
    const io = req.app.get('io');
    const updated = await service.reject(
      req.params.id,
      { storeId: req.user!.storeId, reason: req.body.reason },
      io
    );
    res.json(updated);
  } catch (e) { next(e); }
});

router.get('/bill-calls/pending', async (req, res, next) => {
  try {
    const pending = await service.listPendingBillCalls(req.user!.storeId);
    res.json(pending);
  } catch (e) { next(e); }
});

router.post('/bill-calls/:id/acknowledge', async (req, res, next) => {
  try {
    const io = req.app.get('io');
    const updated = await service.acknowledgeBillCall(req.params.id, req.user!.storeId, io);
    res.json(updated);
  } catch (e) { next(e); }
});

export { publicRouter as selfOrderPublicRouter, router as selfOrderRouter };
