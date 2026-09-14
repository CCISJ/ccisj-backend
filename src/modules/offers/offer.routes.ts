import { Router } from 'express';

import { getAll, getById, create, update, remove } from './offer.controller';
import { requireAuth, requireRole } from '@/middlewares/auth.middleware';

const router = Router();

router.use(requireAuth);

router.get('/', getAll);
router.get('/:id', getById);

// Un socio solo crea, edita y borra ofertas de su propia empresa; el service
// lo verifica con el usuario de la sesión.
router.post('/', requireRole('ADMIN', 'SOCIO'), create);
router.patch('/:id', requireRole('ADMIN', 'SOCIO'), update);
router.delete('/:id', requireRole('ADMIN', 'SOCIO'), remove);

export default router;
