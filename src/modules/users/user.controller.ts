import type { Request, Response } from 'express';
import * as userService from './user.service';

export async function getAll(_req: Request, res: Response) {
  try {
    const usuarios = await userService.getAll();

    res.json(usuarios);
  } catch {
    res.status(500).json({
      message: 'Error al obtener usuarios',
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

    const usuario = await userService.getById(id);

    res.json(usuario);
  } catch (error) {
    res.status(404).json({
      message:
        error instanceof Error ? error.message : 'Error al obtener usuario',
    });
  }
}

export async function getNotificationRecipients(_req: Request, res: Response) {
  try {
    const users = await userService.findNotificationRecipients();

    return res.json(users);
  } catch (error) {
    return res.status(500).json({
      message: 'Error al obtener los destinatarios',
    });
  }
}

export async function create(req: Request, res: Response) {
  try {
    const usuario = await userService.create(req.body);

    res.status(201).json(usuario);
  } catch (error) {
    res.status(400).json({
      message:
        error instanceof Error ? error.message : 'Error al crear usuario',
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

    const usuario = await userService.update(id, req.body);

    res.json(usuario);
  } catch (error) {
    res.status(400).json({
      message:
        error instanceof Error ? error.message : 'Error al actualizar usuario',
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

    await userService.remove(id);

    res.status(204).send();
  } catch (error) {
    res.status(404).json({
      message:
        error instanceof Error ? error.message : 'Error al eliminar usuario',
    });
  }
}
