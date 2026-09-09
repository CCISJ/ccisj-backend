import { Router } from 'express';

import * as authController from './auth.controller';
import { requireAuth } from '@/middlewares/auth.middleware';

const router = Router();

router.post('/login', authController.login);
router.get('/me', requireAuth, authController.me);
router.post('/logout', authController.logout);

export default router;
