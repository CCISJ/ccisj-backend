import { Router } from 'express';

import { getAll, getById, create, update, remove } from './member.controller';
import {
  requireAdminOrDirectivo,
  requireAuth,
  requireRole,
} from '@/middlewares/auth.middleware';

const router = Router();

router.use(requireAuth);

// Los directivos consultan un directorio reducido; el controller decide qué
// versión devolver según el rol.
router.get('/', requireAdminOrDirectivo, getAll);
router.get('/:id', requireAdminOrDirectivo, getById);

router.post('/', requireRole('ADMIN'), create);
router.patch('/:id', requireRole('ADMIN'), update);
router.delete('/:id', requireRole('ADMIN'), remove);

export default router;
