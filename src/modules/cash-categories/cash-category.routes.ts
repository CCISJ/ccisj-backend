import { Router } from 'express';

import { requireAdmin, requireAuth } from '@/middlewares/auth.middleware';

import {
  createCategory,
  deleteCategory,
  getCategories,
} from './cash-category.controller';

const router = Router();

router.get('/', requireAuth, requireAdmin, getCategories);

router.post('/', requireAuth, requireAdmin, createCategory);

router.delete('/:id', requireAuth, requireAdmin, deleteCategory);

export default router;
