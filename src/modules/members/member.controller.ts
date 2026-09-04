import type { Request, Response } from 'express';
import * as memberService from './member.service';

export async function getAll(_req: Request, res: Response) {
  try {
    const members = await memberService.getAll();

    res.json(members);
  } catch (error) {
    res.status(500).json({
      message: 'Error al obtener los socios',
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

    const member = await memberService.getById(id);

    res.json(member);
  } catch (error) {
    res.status(404).json({
      message:
        error instanceof Error ? error.message : 'Error al obtener el socio',
    });
  }
}

export async function create(req: Request, res: Response) {
  try {
    const member = await memberService.create(req.body);

    res.status(201).json(member);
  } catch (error) {
    res.status(400).json({
      message:
        error instanceof Error ? error.message : 'Error al crear el socio',
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

    const member = await memberService.update(id, req.body);

    res.json(member);
  } catch (error) {
    res.status(400).json({
      message:
        error instanceof Error ? error.message : 'Error al actualizar el socio',
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

    await memberService.remove(id);

    res.status(204).send();
  } catch (error) {
    res.status(404).json({
      message:
        error instanceof Error ? error.message : 'Error al eliminar el socio',
    });
  }
}
