import type { Response } from 'express';

import type { AuthRequest } from '@/middlewares/auth.middleware';
import { parseId } from '@/utils/params';
import { sendError } from '@/utils/send-error';

import * as gestionService from './gestion.service';

function invalidId(res: Response) {
  return res.status(400).json({ message: 'ID inválido' });
}

export async function getAll(req: AuthRequest, res: Response) {
  try {
    res.json(await gestionService.getAll(req.query));
  } catch (error) {
    sendError(res, error, {
      status: 400,
      message: 'Error al obtener las gestiones',
    });
  }
}

export async function getCategories(_req: AuthRequest, res: Response) {
  try {
    res.json(await gestionService.getCategories());
  } catch (error) {
    sendError(res, error, {
      status: 500,
      message: 'Error al obtener las categorías',
    });
  }
}

export async function getById(req: AuthRequest, res: Response) {
  try {
    const id = parseId(req.params.id);

    if (!id) return invalidId(res);

    res.json(await gestionService.getById(id));
  } catch (error) {
    sendError(res, error, {
      status: 404,
      message: 'Error al obtener la gestión',
    });
  }
}

export async function create(req: AuthRequest, res: Response) {
  try {
    const gestion = await gestionService.create(req.body, req.user!.id);

    res.status(201).json(gestion);
  } catch (error) {
    sendError(res, error, {
      status: 400,
      message: 'Error al crear la gestión',
    });
  }
}

export async function update(req: AuthRequest, res: Response) {
  try {
    const id = parseId(req.params.id);

    if (!id) return invalidId(res);

    res.json(await gestionService.update(id, req.body));
  } catch (error) {
    sendError(res, error, {
      status: 400,
      message: 'Error al actualizar la gestión',
    });
  }
}

export async function remove(req: AuthRequest, res: Response) {
  try {
    const id = parseId(req.params.id);

    if (!id) return invalidId(res);

    await gestionService.remove(id);

    res.json({ message: 'Gestión eliminada' });
  } catch (error) {
    sendError(res, error, {
      status: 400,
      message: 'Error al eliminar la gestión',
    });
  }
}

export async function addFiles(req: AuthRequest, res: Response) {
  try {
    const id = parseId(req.params.id);

    if (!id) return invalidId(res);

    const files = Array.isArray(req.files) ? req.files : [];

    res.status(201).json(await gestionService.addFiles(id, files));
  } catch (error) {
    sendError(res, error, {
      status: 400,
      message: 'Error al subir los archivos',
    });
  }
}

export async function getFileUrl(req: AuthRequest, res: Response) {
  try {
    const id = parseId(req.params.id);
    const archivoId = parseId(req.params.archivoId);

    if (!id || !archivoId) return invalidId(res);

    res.json(await gestionService.getFileUrl(id, archivoId));
  } catch (error) {
    sendError(res, error, {
      status: 404,
      message: 'Error al obtener el archivo',
    });
  }
}

export async function removeFile(req: AuthRequest, res: Response) {
  try {
    const id = parseId(req.params.id);
    const archivoId = parseId(req.params.archivoId);

    if (!id || !archivoId) return invalidId(res);

    await gestionService.removeFile(id, archivoId);

    res.json({ message: 'Archivo eliminado' });
  } catch (error) {
    sendError(res, error, {
      status: 400,
      message: 'Error al eliminar el archivo',
    });
  }
}
