import { Router } from 'express';

import { requireAdmin, requireAuth } from '@/middlewares/auth.middleware';

import {
  cancelMovement,
  createMovement,
  getCashSummary,
  getMovements,
} from './cash-movement.controller';

const router = Router();

router.get('/', requireAuth, requireAdmin, getMovements);

router.post('/', requireAuth, requireAdmin, createMovement);

router.get('/resumen', requireAuth, requireAdmin, getCashSummary);

router.patch('/:id/anular', requireAuth, requireAdmin, cancelMovement);

export default router;
