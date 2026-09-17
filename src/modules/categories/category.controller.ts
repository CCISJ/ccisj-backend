import type { Request, Response } from 'express';
import { parseId } from '@/utils/params';
import { sendError } from '@/utils/send-error';
import * as categoryService from './category.service';

function invalidId(res: Response) {
  return res.status(400).json({
    message: 'ID inválido',
  });
}

export async function getAll(_req: Request, res: Response) {
  try {
    const categories = await categoryService.getAll();
    res.json(categories);
  } catch (error) {
    sendError(res, error, {
      status: 500,
      message: 'Error al obtener las categorías',
    });
  }
}

export async function getById(req: Request, res: Response) {
  try {
    const id = parseId(req.params.id);

    if (!id) return invalidId(res);

    const category = await categoryService.getById(id);

    res.json(category);
  } catch (error) {
    sendError(res, error, {
      status: 404,
      message: 'Error al obtener la categoría',
    });
  }
}

export async function create(req: Request, res: Response) {
  try {
    const category = await categoryService.create(req.body);

    res.status(201).json(category);
  } catch (error) {
    sendError(res, error, {
      status: 400,
      message: 'Error al crear la categoría',
    });
  }
}

export async function update(req: Request, res: Response) {
  try {
    const id = parseId(req.params.id);

    if (!id) return invalidId(res);

    const category = await categoryService.update(id, req.body);

    res.json(category);
  } catch (error) {
    sendError(res, error, {
      status: 400,
      message: 'Error al actualizar la categoría',
    });
  }
}

// Desactiva la categoría (ver `categoryService.remove`).
export async function remove(req: Request, res: Response) {
  try {
    const id = parseId(req.params.id);

    if (!id) return invalidId(res);

    await categoryService.remove(id);

    res.status(204).send();
  } catch (error) {
    sendError(res, error, {
      status: 404,
      message: 'Error al desactivar la categoría',
    });
  }
}
