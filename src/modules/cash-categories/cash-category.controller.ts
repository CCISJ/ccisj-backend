import type { Request, Response } from 'express';

import { sendError } from '@/utils/send-error';

import {
  addCashCategory,
  getCashCategories,
  removeCashCategory,
} from './cash-category.service';

export async function getCategories(_req: Request, res: Response) {
  try {
    const categories = await getCashCategories();

    return res.json(categories);
  } catch (error) {
    return sendError(res, error, {
      status: 400,
      message: 'Error al obtener las categorías',
    });
  }
}

export async function createCategory(req: Request, res: Response) {
  try {
    const category = await addCashCategory({
      nombre: req.body.nombre,
      tipo: req.body.tipo,
    });

    return res.status(201).json(category);
  } catch (error) {
    return sendError(res, error, {
      status: 400,
      message: 'Error al crear la categoría',
    });
  }
}

export async function deleteCategory(req: Request, res: Response) {
  try {
    const id = Number(req.params.id);

    const category = await removeCashCategory(id);

    return res.json(category);
  } catch (error) {
    return sendError(res, error, {
      status: 400,
      message: 'Error al eliminar la categoría',
    });
  }
}
