import type { Request, Response } from 'express';
import type { AuthRequest } from '@/middlewares/auth.middleware';

import { parseId } from '@/utils/params';
import { sendError } from '@/utils/send-error';
import * as applicationService from './application.service';

export async function getAll(_req: Request, res: Response) {
  try {
    const applications = await applicationService.getAll();
    res.json(applications);
  } catch (error) {
    sendError(res, error, {
      status: 500,
      message: 'Error al obtener las postulaciones',
    });
  }
}

function invalidId(res: Response) {
  return res.status(400).json({
    message: 'ID inválido',
  });
}

export async function getReceived(req: AuthRequest, res: Response) {
  try {
    const applications = await applicationService.getReceived(req.user!);

    res.json(applications);
  } catch (error) {
    sendError(res, error, {
      status: 500,
      message: 'Error al obtener las postulaciones',
    });
  }
}

export async function getReceivedById(req: AuthRequest, res: Response) {
  try {
    const id = parseId(req.params.id);

    if (!id) return invalidId(res);

    const application = await applicationService.getReceivedById(id, req.user!);

    res.json(application);
  } catch (error) {
    sendError(res, error, {
      status: 500,
      message: 'Error al obtener la postulación',
    });
  }
}

export async function getById(req: AuthRequest, res: Response) {
  try {
    const id = parseId(req.params.id);

    if (!id) return invalidId(res);

    const application = await applicationService.getById(id, req.user!);
    res.json(application);
  } catch (error) {
    sendError(res, error, {
      status: 404,
      message: 'Error al obtener la postulación',
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
    sendError(res, error, {
      status: 400,
      message: 'Error al crear la postulación',
    });
  }
}

export async function update(req: AuthRequest, res: Response) {
  try {
    const id = parseId(req.params.id);

    if (!id) return invalidId(res);

    const application = await applicationService.update(
      id,
      req.body ?? {},
      req.user!,
    );

    res.json(application);
  } catch (error) {
    sendError(res, error, {
      status: 500,
      message: 'Error al actualizar la postulación',
    });
  }
}

export async function remove(req: AuthRequest, res: Response) {
  try {
    const id = parseId(req.params.id);

    if (!id) return invalidId(res);

    await applicationService.remove(id, req.user!);
    res.status(204).send();
  } catch (error) {
    sendError(res, error, {
      status: 404,
      message: 'Error al eliminar la postulación',
    });
  }
}
