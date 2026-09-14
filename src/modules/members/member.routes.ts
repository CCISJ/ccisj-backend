import { Router } from 'express';

import {
  getAll,
  getById,
  getMe,
  updateMe,
  create,
  update,
  remove,
} from './member.controller';
import {
  requireAdminOrDirectivo,
  requireAuth,
  requireRole,
} from '@/middlewares/auth.middleware';

const router = Router();

router.use(requireAuth);

// La empresa del socio de la sesión. Tiene que ir antes de `/:id`, que si no
// interpreta "me" como un ID.
router.get('/me', requireRole('SOCIO'), getMe);
router.patch('/me', requireRole('SOCIO'), updateMe);

// Los directivos consultan un directorio reducido; el controller decide qué
// versión devolver según el rol.
router.get('/', requireAdminOrDirectivo, getAll);
router.get('/:id', requireAdminOrDirectivo, getById);

router.post('/', requireRole('ADMIN'), create);
router.patch('/:id', requireRole('ADMIN'), update);
router.delete('/:id', requireRole('ADMIN'), remove);

export default router;
