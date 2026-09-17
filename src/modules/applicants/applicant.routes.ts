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

// Todavía no hay registro público de postulantes: el alta la hace el
// administrador. El postulante puede ver y editar solo su propio perfil.
router.get('/', requireRole('ADMIN'), getAll);
router.get('/:id', requireRole('ADMIN', 'POSTULANTE'), getById);
router.post('/', requireRole('ADMIN'), create);
router.patch('/:id', requireRole('ADMIN', 'POSTULANTE'), update);
router.delete('/:id', requireRole('ADMIN'), remove);

export default router;
