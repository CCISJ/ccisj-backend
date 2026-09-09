import { Router } from 'express';

import {
  getAll,
  getById,
  create,
  update,
  remove,
} from './applicant.controller';

const router = Router();

router.get('/', getAll);
router.get('/:id', getById);
router.post('/', create);
router.patch('/:id', update);
router.delete('/:id', remove);

export default router;
