import { Router } from 'express';

import { requireAuth, requireRole } from '@/middlewares/auth.middleware';

import {
  create,
  getActive,
  getAll,
  getById,
  remove,
  update,
} from './category.controller';

const router = Router();

// Pública: el registro de postulantes muestra las categorías para elegir de
// cuáles recibir ofertas. Solo id y nombre de las activas.
router.get('/activas', getActive);

router.use(requireAuth);

// Cualquier usuario con sesión las consulta (para publicar o filtrar
// ofertas); solo el administrador las modifica.
router.get('/', getAll);
router.get('/:id', getById);
router.post('/', requireRole('ADMIN'), create);
router.patch('/:id', requireRole('ADMIN'), update);
router.delete('/:id', requireRole('ADMIN'), remove);

export default router;
