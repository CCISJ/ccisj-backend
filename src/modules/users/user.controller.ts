import type { Request, Response } from 'express';
import type { AuthRequest } from '@/middlewares/auth.middleware';
import { parseId } from '@/utils/params';
import { sendError } from '@/utils/send-error';
import * as userService from './user.service';

function invalidId(res: Response) {
  return res.status(400).json({
    message: 'ID inválido',
  });
}

export async function getAll(_req: Request, res: Response) {
  try {
    const usuarios = await userService.getAll();

    res.json(usuarios);
  } catch (error) {
    sendError(res, error, {
      status: 500,
      message: 'Error al obtener usuarios',
    });
  }
}

export async function getById(req: Request, res: Response) {
  try {
    const id = parseId(req.params.id);

    if (!id) return invalidId(res);

    const usuario = await userService.getById(id);

    res.json(usuario);
  } catch (error) {
    sendError(res, error, { status: 404, message: 'Error al obtener usuario' });
  }
}

export async function getNotificationRecipients(_req: Request, res: Response) {
  try {
    const users = await userService.findNotificationRecipients();

    return res.json(users);
  } catch (error) {
    return sendError(res, error, {
      status: 500,
      message: 'Error al obtener los destinatarios',
    });
  }
}

export async function create(req: Request, res: Response) {
  try {
    const usuario = await userService.create(req.body);

    res.status(201).json(usuario);
  } catch (error) {
    sendError(res, error, { status: 400, message: 'Error al crear usuario' });
  }
}

export async function update(req: AuthRequest, res: Response) {
  try {
    const id = parseId(req.params.id);

    if (!id) return invalidId(res);

    const usuario = await userService.update(id, req.body, req.user!.id);

    res.json(usuario);
  } catch (error) {
    sendError(res, error, {
      status: 400,
      message: 'Error al actualizar usuario',
    });
  }
}

export async function remove(req: AuthRequest, res: Response) {
  try {
    const id = parseId(req.params.id);

    if (!id) return invalidId(res);

    await userService.remove(id, req.user!.id);

    res.status(204).send();
  } catch (error) {
    sendError(res, error, {
      status: 404,
      message: 'Error al eliminar usuario',
    });
  }
}
