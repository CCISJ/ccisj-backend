import { Router } from 'express';

import {
  create,
  getAll,
  getMine,
  getPendingPopups,
  markAsRead,
  markPopupAsSeen,
} from './notification.controller';

import { requireAuth, requireRole } from '@/middlewares/auth.middleware';

const router = Router();

// Ver todas las notificaciones enviadas y crear nuevas es tarea del
// administrador; cada usuario consulta y marca solo las que recibió.
router.get('/', requireAuth, requireRole('ADMIN'), getAll);
router.get('/recibidas', requireAuth, getMine);
router.get('/emergentes', requireAuth, getPendingPopups);

router.post('/', requireAuth, requireRole('ADMIN'), create);

router.patch('/:id/leida', requireAuth, markAsRead);
router.patch('/:id/emergente-vista', requireAuth, markPopupAsSeen);

export default router;
