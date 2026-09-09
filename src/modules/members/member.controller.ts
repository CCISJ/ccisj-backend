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
    const data = {
      ...req.body,
      fechaInicioEmpresa: req.body.fechaInicioEmpresa
        ? new Date(req.body.fechaInicioEmpresa)
        : undefined,
      fechaAfiliacion: req.body.fechaAfiliacion
        ? new Date(req.body.fechaAfiliacion)
        : undefined,
    };

    const { socioId, email, passwordInicial } =
      await memberService.create(data);

    res.status(201).json({
      message: 'Socio creado correctamente',
      socioId,
      email,
      passwordInicial,
    });
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

    const member = await memberService.update(id, req.body);

    return res.status(200).json(member);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Error al actualizar socio';

    if (message === 'Socio no encontrado') {
      return res.status(404).json({
        message,
      });
    }

    return res.status(400).json({
      message,
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

    return res.status(200).json({
      message: 'Socio desactivado correctamente',
    });
  } catch (error) {
    res.status(404).json({
      message:
        error instanceof Error ? error.message : 'Error al eliminar el socio',
    });
  }
}
