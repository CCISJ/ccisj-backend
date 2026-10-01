import { Router } from 'express';

import { requireAuth, requireRole } from '@/middlewares/auth.middleware';

import {
  create,
  getAll,
  getById,
  remove,
  update,
} from './applicant.controller';

const router = Router();

router.use(requireAuth);

// El registro público de postulantes está en POST /auth/registro (sin
// sesión). Acá el administrador también puede dar de alta postulantes, y el
// postulante puede ver y editar solo su propio perfil.
router.get('/', requireRole('ADMIN'), getAll);
router.get('/:id', requireRole('ADMIN', 'POSTULANTE'), getById);
router.post('/', requireRole('ADMIN'), create);
router.patch('/:id', requireRole('ADMIN', 'POSTULANTE'), update);
router.delete('/:id', requireRole('ADMIN'), remove);

export default router;
