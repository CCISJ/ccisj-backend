import { Router } from 'express';

import { requireAuth, requireRole } from '@/middlewares/auth.middleware';
import { uploadCvFiles } from '@/middlewares/upload-cv.middleware';

import {
  create,
  getAll,
  getById,
  remove,
  update,
} from './applicant.controller';
import {
  deleteMyCvFile,
  getMyCv,
  getMyCvFileUrl,
  saveMyCv,
  saveMyProfile,
  uploadMyCvFiles,
} from './cv.controller';

const router = Router();

router.use(requireAuth);

// El registro público de postulantes está en POST /auth/registro (sin
// sesión). Acá el administrador también puede dar de alta postulantes, y el
// postulante puede ver y editar solo su propio perfil.
router.get('/', requireRole('ADMIN'), getAll);

// "Mi CV" del postulante de la sesión: datos, estudios, experiencia,
// referencias y los PDF que subió. Van antes de /:id para que 'me' no se tome
// como un ID.
router.get('/me/cv', requireRole('POSTULANTE'), getMyCv);
router.put('/me/cv', requireRole('POSTULANTE'), saveMyCv);
// "Mi perfil": datos personales y rubros de interés. Se lee con GET /me/cv.
router.patch('/me/perfil', requireRole('POSTULANTE'), saveMyProfile);
router.post(
  '/me/cv/archivos',
  requireRole('POSTULANTE'),
  uploadCvFiles,
  uploadMyCvFiles,
);
router.get('/me/cv/archivos/:cvId', requireRole('POSTULANTE'), getMyCvFileUrl);
router.delete(
  '/me/cv/archivos/:cvId',
  requireRole('POSTULANTE'),
  deleteMyCvFile,
);

router.get('/:id', requireRole('ADMIN', 'POSTULANTE'), getById);
router.post('/', requireRole('ADMIN'), create);
router.patch('/:id', requireRole('ADMIN', 'POSTULANTE'), update);
router.delete('/:id', requireRole('ADMIN'), remove);

export default router;
