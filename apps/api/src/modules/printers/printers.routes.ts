import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../../middleware/auth.middleware';
import { rbac } from '../../middleware/rbac.middleware';
import { validate } from '../../middleware/validate.middleware';
import * as service from './printers.service';

const printerBody = z.object({
  name: z.string().min(1).max(60),
  ip: z.string().min(3).max(100),
  port: z.number().int().min(1).max(65535).optional(),
  role: z.enum(['KITCHEN', 'RECEIPT']).optional(),
  autoPrint: z.boolean().optional(),
  copies: z.number().int().min(1).max(5).optional(),
  categoryIds: z.array(z.string()).optional(),
  isActive: z.boolean().optional(),
});
const createSchema = printerBody;
const updateSchema = printerBody.partial();

// ---- /api/printers — station management (list is open to all staff: the mobile app reads it)
export const printersRouter = Router();
printersRouter.use(authMiddleware);

printersRouter.get('/', async (req, res, next) => {
  try { res.json(await service.listPrinters(req.user!.storeId)); } catch (e) { next(e); }
});

printersRouter.post('/', rbac('OWNER', 'ADMIN'), validate(createSchema), async (req, res, next) => {
  try { res.status(201).json(await service.createPrinter(req.user!.storeId, req.body)); } catch (e) { next(e); }
});

printersRouter.patch('/:id', rbac('OWNER', 'ADMIN'), validate(updateSchema), async (req, res, next) => {
  try { res.json(await service.updatePrinter(req.user!.storeId, req.params.id, req.body)); } catch (e) { next(e); }
});

printersRouter.delete('/:id', rbac('OWNER', 'ADMIN'), async (req, res, next) => {
  try {
    await service.deletePrinter(req.user!.storeId, req.params.id);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// Queues a test ticket; the phone on the shop WiFi actually prints it.
printersRouter.post('/:id/test', rbac('OWNER', 'ADMIN', 'MANAGER', 'CASHIER'), async (req, res, next) => {
  try {
    res.status(201).json(await service.testPrint(req.user!.storeId, req.params.id, req.app.get('io')));
  } catch (e) { next(e); }
});

// ---- /api/print-jobs — the queue the phone drains
export const printJobsRouter = Router();
printJobsRouter.use(authMiddleware);

printJobsRouter.get('/', async (req, res, next) => {
  try { res.json(await service.listJobs(req.user!.storeId, Number(req.query.limit) || 30)); } catch (e) { next(e); }
});

// Jobs to print right now (leased for 30s to the caller).
printJobsRouter.get('/pending', async (req, res, next) => {
  try { res.json(await service.claimPending(req.user!.storeId)); } catch (e) { next(e); }
});

printJobsRouter.post('/:id/complete', async (req, res, next) => {
  try { res.json(await service.completeJob(req.user!.storeId, req.params.id)); } catch (e) { next(e); }
});

printJobsRouter.post('/:id/fail', validate(z.object({ error: z.string().default('print failed') })), async (req, res, next) => {
  try { res.json(await service.failJob(req.user!.storeId, req.params.id, req.body.error)); } catch (e) { next(e); }
});

// Retry / reprint, optionally on another printer ("พิมพ์ที่ครัวหลังแทน").
printJobsRouter.post('/:id/reprint', validate(z.object({ printerId: z.string().optional() })), async (req, res, next) => {
  try {
    res.json(await service.reprintJob(req.user!.storeId, req.params.id, req.body.printerId, req.app.get('io')));
  } catch (e) { next(e); }
});
