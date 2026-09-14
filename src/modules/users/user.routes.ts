import { Router } from 'express';
import { getAll, getById, create, update, remove } from './user.controller';
import { requireAuth, requireRole } from '@/middlewares/auth.middleware';

const router = Router();

// Las cuentas de usuario solo las administra el administrador.
router.use(requireAuth, requireRole('ADMIN'));

router.get('/', getAll);
router.get('/:id', getById);
router.post('/', create);
router.patch('/:id', update);
router.delete('/:id', remove);

export default router;
