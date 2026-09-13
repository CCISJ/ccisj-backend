import { Router } from 'express';

import {
  create,
  getAll,
  getMine,
  getPendingPopups,
  markAsRead,
  markPopupAsSeen,
} from './notification.controller';

import { requireAuth } from '@/middlewares/auth.middleware';

const router = Router();

router.get('/', requireAuth, getAll);
router.get('/recibidas', requireAuth, getMine);
router.get('/emergentes', requireAuth, getPendingPopups);

router.post('/', requireAuth, create);

router.patch('/:id/leida', requireAuth, markAsRead);
router.patch('/:id/emergente-vista', requireAuth, markPopupAsSeen);

export default router;
