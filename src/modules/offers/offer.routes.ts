import { Router } from 'express';

import {
  optionalAuth,
  requireAuth,
  requireRole,
} from '@/middlewares/auth.middleware';

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

// La bolsa de trabajo es pública: el cliente definió que cualquiera ve las
// ofertas sin cuenta y que solo los registrados se postulan. Estas dos rutas
// usan `optionalAuth`, así que contestan con sesión y sin ella; el service
// decide qué mostrar según quién pregunte. Van antes del `requireAuth` de
// abajo, que protege todo el resto.
router.get('/', optionalAuth, getAll);

// Antes de `/:id`, si no Express toma "mias" como un ID.
router.get('/mias', requireAuth, requireRole('SOCIO'), getMine);
router.get('/mias/:id', requireAuth, requireRole('SOCIO'), getMineById);

router.get('/:id', optionalAuth, getById);

router.use(requireAuth);

// Un socio solo crea, edita y borra ofertas de su propia empresa; el service
// lo verifica con el usuario de la sesión.
router.post('/', requireRole('ADMIN', 'SOCIO'), create);
router.patch('/:id', requireRole('ADMIN', 'SOCIO'), update);
router.delete('/:id', requireRole('ADMIN', 'SOCIO'), remove);

export default router;
