import type { Request, Response } from 'express';
import type { AuthRequest } from '@/middlewares/auth.middleware';
import { statusFor } from '@/utils/http-error';
import * as applicationService from './application.service';

export async function getAll(_req: Request, res: Response) {
  try {
    const applications = await applicationService.getAll();
    res.json(applications);
  } catch {
    res.status(500).json({
      message: 'Error al obtener las postulaciones',
    });
  }
}

export async function getById(req: AuthRequest, res: Response) {
  try {
    const id = Number(req.params.id);

    if (Number.isNaN(id)) {
      return res.status(400).json({
        message: 'ID inválido',
      });
    }

    const application = await applicationService.getById(id, req.user!);
    res.json(application);
  } catch (error) {
    res.status(404).json({
      message:
        error instanceof Error
          ? error.message
          : 'Error al obtener la postulación',
    });
  }
}

export async function create(req: AuthRequest, res: Response) {
  try {
    const application = await applicationService.create(
      req.body ?? {},
      req.user!,
    );
    res.status(201).json(application);
  } catch (error) {
    res.status(400).json({
      message:
        error instanceof Error
          ? error.message
          : 'Error al crear la postulación',
    });
  }
}

export async function update(req: AuthRequest, res: Response) {
  try {
    const id = Number(req.params.id);

    if (Number.isNaN(id)) {
      return res.status(400).json({
        message: 'ID inválido',
      });
    }

    const application = await applicationService.update(
      id,
      req.body ?? {},
      req.user!,
    );

    res.json(application);
  } catch (error) {
    res.status(statusFor(error, 400)).json({
      message:
        error instanceof Error
          ? error.message
          : 'Error al actualizar la postulación',
    });
  }
}

export async function remove(req: AuthRequest, res: Response) {
  try {
    const id = Number(req.params.id);

    if (Number.isNaN(id)) {
      return res.status(400).json({
        message: 'ID inválido',
      });
    }

    await applicationService.remove(id, req.user!);
    res.status(204).send();
  } catch (error) {
    res.status(404).json({
      message:
        error instanceof Error
          ? error.message
          : 'Error al eliminar la postulación',
    });
  }
}
