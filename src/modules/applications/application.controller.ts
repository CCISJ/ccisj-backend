import type { Request, Response } from 'express';
import type { AuthRequest } from '@/middlewares/auth.middleware';
import { HttpError, statusFor } from '@/utils/http-error';
import { parseId } from '@/utils/params';
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

// Errores de validación del service: su mensaje es para el usuario. Otro
// error es inesperado y su mensaje puede traer detalles internos de la base.
function sendError(res: Response, error: unknown, fallback: string) {
  res.status(statusFor(error, 500)).json({
    message: error instanceof HttpError ? error.message : fallback,
  });
}

export async function getReceived(req: AuthRequest, res: Response) {
  try {
    const applications = await applicationService.getReceived(req.user!);

    res.json(applications);
  } catch (error) {
    sendError(res, error, 'Error al obtener las postulaciones');
  }
}

export async function getReceivedById(req: AuthRequest, res: Response) {
  try {
    const id = parseId(req.params.id);

    if (!id) {
      return res.status(400).json({
        message: 'ID inválido',
      });
    }

    const application = await applicationService.getReceivedById(id, req.user!);

    res.json(application);
  } catch (error) {
    sendError(res, error, 'Error al obtener la postulación');
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
    const id = parseId(req.params.id);

    if (!id) {
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
    sendError(res, error, 'Error al actualizar la postulación');
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
