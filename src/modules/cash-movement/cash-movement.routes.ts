import { Router } from 'express';

import { requireAdmin, requireAuth } from '@/middlewares/auth.middleware';

import { createMovement, getMovements } from './cash-movement.controller';

const router = Router();

router.get('/', requireAuth, requireAdmin, getMovements);

router.post('/', requireAuth, requireAdmin, createMovement);

export default router;
