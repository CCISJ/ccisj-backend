import type { Request, Response } from 'express';

import type { AuthRequest } from '@/middlewares/auth.middleware';
import { parseId } from '@/utils/params';
import { sendError } from '@/utils/send-error';

import * as notificationService from './notification.service';

function invalidId(res: Response) {
  return res.status(400).json({
    message: 'ID inválido',
  });
}

export async function getAll(_req: Request, res: Response) {
  try {
    const notifications = await notificationService.getAll();

    res.json(notifications);
  } catch (error) {
    sendError(res, error, {
      status: 500,
      message: 'Error al obtener las notificaciones',
    });
  }
}

export async function create(req: AuthRequest, res: Response) {
  try {
    const notification = await notificationService.create({
      ...req.body,
      creadoPorId: req.user!.id,
    });

    res.status(201).json(notification);
  } catch (error) {
    sendError(res, error, {
      status: 400,
      message: 'Error al crear la notificación',
    });
  }
}

export async function getMine(req: AuthRequest, res: Response) {
  try {
    const notifications = await notificationService.getByUserId(req.user!.id);

    res.json(notifications);
  } catch (error) {
    sendError(res, error, {
      status: 500,
      message: 'Error al obtener las notificaciones',
    });
  }
}

export async function getPendingPopups(req: AuthRequest, res: Response) {
  try {
    const notifications = await notificationService.getPendingPopups(
      req.user!.id,
    );

    res.json(notifications);
  } catch (error) {
    sendError(res, error, {
      status: 500,
      message: 'Error al obtener las notificaciones emergentes',
    });
  }
}

export async function markAsRead(req: AuthRequest, res: Response) {
  try {
    const id = parseId(req.params.id);

    if (!id) return invalidId(res);

    const notification = await notificationService.markAsRead(req.user!.id, id);

    res.json(notification);
  } catch (error) {
    sendError(res, error, {
      status: 400,
      message: 'Error al marcar la notificación como leída',
    });
  }
}

export async function markPopupAsSeen(req: AuthRequest, res: Response) {
  try {
    const id = parseId(req.params.id);

    if (!id) return invalidId(res);

    const notification = await notificationService.markPopupAsSeen(
      req.user!.id,
      id,
    );

    res.json(notification);
  } catch (error) {
    sendError(res, error, {
      status: 400,
      message: 'Error al marcar la notificación emergente como vista',
    });
  }
}
