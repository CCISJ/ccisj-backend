import { Router } from 'express';

import { requireAuth, requireRole } from '@/middlewares/auth.middleware';

import {
  create,
  getAll,
  getById,
  getMine,
  getMineById,
  remove,
  update,
} from './offer.controller';

const router = Router();

router.use(requireAuth);

router.get('/', getAll);

// Antes de `/:id`, si no Express toma "mias" como un ID.
router.get('/mias', requireRole('SOCIO'), getMine);
router.get('/mias/:id', requireRole('SOCIO'), getMineById);

router.get('/:id', getById);

// Un socio solo crea, edita y borra ofertas de su propia empresa; el service
// lo verifica con el usuario de la sesión.
router.post('/', requireRole('ADMIN', 'SOCIO'), create);
router.patch('/:id', requireRole('ADMIN', 'SOCIO'), update);
router.delete('/:id', requireRole('ADMIN', 'SOCIO'), remove);

export default router;
