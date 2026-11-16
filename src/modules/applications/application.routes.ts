import { Router } from 'express';

import { requireAuth, requireRole } from '@/middlewares/auth.middleware';

import {
  create,
  getAll,
  getById,
  getMine,
  getReceived,
  getReceivedById,
  getReceivedCvFile,
  remove,
  update,
  withdraw,
} from './application.controller';

const router = Router();

router.use(requireAuth);

// El service verifica que cada uno acceda solo a lo suyo: el postulante a sus
// postulaciones y el socio a las recibidas en sus ofertas.
router.get('/', requireRole('ADMIN'), getAll);
// Van antes de /:id para que 'mias' y 'recibidas' no se tomen como un ID.
router.get('/mias', requireRole('POSTULANTE'), getMine);
router.get('/recibidas', requireRole('SOCIO'), getReceived);
router.get('/recibidas/:id', requireRole('SOCIO'), getReceivedById);
router.get('/recibidas/:id/cv/:cvId', requireRole('SOCIO'), getReceivedCvFile);
router.get('/:id', getById);
router.post('/', requireRole('POSTULANTE'), create);
router.patch('/:id', requireRole('ADMIN', 'SOCIO'), update);
// El postulante no borra su postulación: la retira y queda en el historial.
router.patch('/:id/retirar', requireRole('POSTULANTE'), withdraw);
router.delete('/:id', requireRole('ADMIN'), remove);

export default router;
