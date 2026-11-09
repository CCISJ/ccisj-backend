import { Router } from 'express';

import {
  requireAdminOrDirectivo,
  requireAuth,
  requireRole,
} from '@/middlewares/auth.middleware';
import { uploadGestionFiles } from '@/middlewares/upload-gestion.middleware';

import {
  addFiles,
  create,
  getAll,
  getById,
  getCategories,
  getFileUrl,
  remove,
  removeFile,
  update,
} from './gestion.controller';

/**
 * Gestoría: lo definió el cliente como un apartado solo para los socios
 * directivos. La administración escribe y los directivos consultan.
 */
const router = Router();

router.use(requireAuth);

router.get('/', requireAdminOrDirectivo, getAll);
router.get('/categorias', requireAdminOrDirectivo, getCategories);
router.get('/:id', requireAdminOrDirectivo, getById);
router.get('/:id/archivos/:archivoId', requireAdminOrDirectivo, getFileUrl);

router.post('/', requireRole('ADMIN'), create);
router.patch('/:id', requireRole('ADMIN'), update);
router.delete('/:id', requireRole('ADMIN'), remove);
router.post(
  '/:id/archivos',
  requireRole('ADMIN'),
  uploadGestionFiles,
  addFiles,
);
router.delete('/:id/archivos/:archivoId', requireRole('ADMIN'), removeFile);

export default router;
