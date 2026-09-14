import { Router } from 'express';

import {
  getAll,
  getById,
  create,
  update,
  remove,
} from './application.controller';
import { requireAuth, requireRole } from '@/middlewares/auth.middleware';

const router = Router();

router.use(requireAuth);

// El service verifica que cada uno acceda solo a lo suyo: el postulante a sus
// postulaciones y el socio a las recibidas en sus ofertas.
router.get('/', requireRole('ADMIN'), getAll);
router.get('/:id', getById);
router.post('/', requireRole('POSTULANTE'), create);
router.patch('/:id', requireRole('ADMIN', 'SOCIO'), update);
router.delete('/:id', requireRole('ADMIN', 'POSTULANTE'), remove);

export default router;
