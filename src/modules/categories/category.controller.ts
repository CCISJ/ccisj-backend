import type { Request, Response } from 'express';
import * as categoryService from './category.service';

export async function getAll(_req: Request, res: Response) {
  try {
    const categories = await categoryService.getAll();
    res.json(categories);
  } catch {
    res.status(500).json({
      message: 'Error al obtener las categorías',
    });
  }
}

export async function getById(req: Request, res: Response) {
  try {
    const id = Number(req.params.id);

    if (Number.isNaN(id)) {
      return res.status(400).json({
        message: 'ID inválido',
      });
    }

    const category = await categoryService.getById(id);

    res.json(category);
  } catch (error) {
    res.status(404).json({
      message:
        error instanceof Error
          ? error.message
          : 'Error al obtener la categoría',
    });
  }
}

export async function create(req: Request, res: Response) {
  try {
    const category = await categoryService.create(req.body);

    res.status(201).json(category);
  } catch (error) {
    res.status(400).json({
      message:
        error instanceof Error ? error.message : 'Error al crear la categoría',
    });
  }
}

export async function update(req: Request, res: Response) {
  try {
    const id = Number(req.params.id);

    if (Number.isNaN(id)) {
      return res.status(400).json({
        message: 'ID inválido',
      });
    }

    const category = await categoryService.update(id, req.body);

    res.json(category);
  } catch (error) {
    res.status(400).json({
      message:
        error instanceof Error
          ? error.message
          : 'Error al actualizar la categoría',
    });
  }
}

export async function remove(req: Request, res: Response) {
  try {
    const id = Number(req.params.id);

    if (Number.isNaN(id)) {
      return res.status(400).json({
        message: 'ID inválido',
      });
    }

    await categoryService.remove(id);

    res.status(204).send();
  } catch (error) {
    res.status(404).json({
      message:
        error instanceof Error
          ? error.message
          : 'Error al eliminar la categoría',
    });
  }
}
