import { Router } from 'express';

import { requireAuth, requireRole } from '@/middlewares/auth.middleware';

import {
  create,
  getAll,
  getById,
  getReceived,
  getReceivedById,
  remove,
  update,
} from './application.controller';

const router = Router();

router.use(requireAuth);

// El service verifica que cada uno acceda solo a lo suyo: el postulante a sus
// postulaciones y el socio a las recibidas en sus ofertas.
router.get('/', requireRole('ADMIN'), getAll);
// Van antes de /:id para que 'recibidas' no se tome como un ID.
router.get('/recibidas', requireRole('SOCIO'), getReceived);
router.get('/recibidas/:id', requireRole('SOCIO'), getReceivedById);
router.get('/:id', getById);
router.post('/', requireRole('POSTULANTE'), create);
router.patch('/:id', requireRole('ADMIN', 'SOCIO'), update);
router.delete('/:id', requireRole('ADMIN', 'POSTULANTE'), remove);

export default router;
