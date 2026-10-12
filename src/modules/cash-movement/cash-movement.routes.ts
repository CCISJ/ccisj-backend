import { Router } from 'express';

import { requireAdmin, requireAuth } from '@/middlewares/auth.middleware';
import { uploadReceipt } from '@/middlewares/upload-receipt.middleware';

import {
  cancelMovement,
  createMovement,
  getCashSummary,
  getMovementReceipt,
  getMovements,
  uploadMovementReceipt,
} from './cash-movement.controller';

const router = Router();

router.get('/', requireAuth, requireAdmin, getMovements);

router.post('/', requireAuth, requireAdmin, createMovement);

router.get('/resumen', requireAuth, requireAdmin, getCashSummary);

router.post(
  '/:id/comprobante',
  requireAuth,
  requireAdmin,
  uploadReceipt,
  uploadMovementReceipt,
);

router.get('/:id/comprobante', requireAuth, requireAdmin, getMovementReceipt);

router.patch('/:id/anular', requireAuth, requireAdmin, cancelMovement);

export default router;
