import { Router } from 'express';
import rateLimit from 'express-rate-limit';

import * as authController from './auth.controller';
import { requireAuth, type AuthRequest } from '@/middlewares/auth.middleware';

const router = Router();

// Frena la prueba de contraseñas por fuerza bruta: 10 intentos fallidos cada
// 15 minutos por IP. Los logins correctos no cuentan. En los tests se
// desactiva porque todos los requests salen de la misma IP.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
  message: {
    message:
      'Demasiados intentos de inicio de sesión. Intente nuevamente en unos minutos.',
  },
});

// Frena probar la contraseña actual desde una sesión ajena: 5 intentos
// fallidos cada 15 minutos por cuenta.
const changePasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: (req) => `usuario-${(req as AuthRequest).user!.id}`,
  skip: () => process.env.NODE_ENV === 'test',
  message: {
    message:
      'Demasiados intentos de cambio de contraseña. Intente nuevamente en unos minutos.',
  },
});

router.post('/login', loginLimiter, authController.login);
router.get('/me', requireAuth, authController.me);
router.post(
  '/cambiar-contrasena',
  requireAuth,
  changePasswordLimiter,
  authController.changePassword,
);
router.post('/logout', authController.logout);

export default router;
