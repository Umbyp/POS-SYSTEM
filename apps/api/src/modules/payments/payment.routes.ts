import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../../middleware/auth.middleware';
import { validate } from '../../middleware/validate.middleware';
import { prisma } from '../../config/prisma';
import * as slipService from './slip.service';

const router = Router();
router.use(authMiddleware);

const verifySchema = z.object({
  payload: z.string().min(10),
  expectedAmount: z.number().positive(),
});

/**
 * POST /api/payments/verify-slip
 * - เรียก EasySlip ตรวจสลิป
 * - validate ยอด + ผู้รับ + เวลา + duplicate
 * - คืนผลและข้อมูล (ยังไม่บันทึก — บันทึกตอน create order)
 */
router.post('/verify-slip', validate(verifySchema), async (req, res, next) => {
  try {
    const { payload, expectedAmount } = req.body as z.infer<typeof verifySchema>;

    const store = await prisma.store.findUnique({
      where: { id: req.user!.storeId },
    });

    const slip = await slipService.verifySlip(payload);
    const match = await slipService.matchSlipWithOrder(slip, {
      expectedAmount,
      storePromptpayId: store?.promptpayId,
      maxAgeMinutes: 60,
    });

    res.json({
      ok: match.ok,
      reasons: match.reasons,
      slip: {
        transRef: slip.transRef,
        date: slip.date,
        amount: slip.amount,
        sender: slip.sender,
        receiver: slip.receiver,
      },
      payload,
    });
  } catch (e) {
    next(e);
  }
});

export default router;
