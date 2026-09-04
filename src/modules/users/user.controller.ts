import type { Request, Response } from 'express';
import * as usuarioService from './user.service';

export async function getAll(_req: Request, res: Response) {
  try {
    const usuarios = await usuarioService.getAll();

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

    const usuario = await usuarioService.getById(id);

    res.json(usuario);
  } catch (error) {
    res.status(404).json({
      message:
        error instanceof Error ? error.message : 'Error al obtener usuario',
    });
  }
}

export async function create(req: Request, res: Response) {
  try {
    const usuario = await usuarioService.create(req.body);

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

    const usuario = await usuarioService.update(id, req.body);

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

    await usuarioService.remove(id);

    res.status(204).send();
  } catch (error) {
    res.status(404).json({
      message:
        error instanceof Error ? error.message : 'Error al eliminar usuario',
    });
  }
}
