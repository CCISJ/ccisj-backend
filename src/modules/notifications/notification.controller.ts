import type { Request, Response } from 'express';
import type { AuthRequest } from '@/middlewares/auth.middleware';

import * as notificationService from './notification.service';

export async function getAll(_req: Request, res: Response) {
  try {
    const notifications = await notificationService.getAll();

    res.json(notifications);
  } catch {
    res.status(500).json({
      message: 'Error al obtener las notificaciones',
    });
  }
}

export async function create(req: AuthRequest, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({
        message: 'No autenticado',
      });
    }

    const notification = await notificationService.create({
      ...req.body,
      creadoPorId: req.user.id,
    });

    res.status(201).json(notification);
  } catch (error) {
    res.status(400).json({
      message:
        error instanceof Error
          ? error.message
          : 'Error al crear la notificación',
    });
  }
}

export async function getMine(req: AuthRequest, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({
        message: 'No autenticado',
      });
    }

    const notifications = await notificationService.getByUserId(req.user.id);

    res.json(notifications);
  } catch {
    res.status(500).json({
      message: 'Error al obtener las notificaciones',
    });
  }
}

export async function getPendingPopups(req: AuthRequest, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({
        message: 'No autenticado',
      });
    }

    const notifications = await notificationService.getPendingPopups(
      req.user.id,
    );

    res.json(notifications);
  } catch {
    res.status(500).json({
      message: 'Error al obtener las notificaciones emergentes',
    });
  }
}

export async function markAsRead(req: AuthRequest, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({
        message: 'No autenticado',
      });
    }

    const id = Number(req.params.id);

    if (Number.isNaN(id)) {
      return res.status(400).json({
        message: 'ID inválido',
      });
    }

    const notification = await notificationService.markAsRead(req.user.id, id);

    res.json(notification);
  } catch (error) {
    res.status(404).json({
      message:
        error instanceof Error
          ? error.message
          : 'Error al marcar la notificación como leída',
    });
  }
}

export async function markPopupAsSeen(req: AuthRequest, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({
        message: 'No autenticado',
      });
    }

    const id = Number(req.params.id);

    if (Number.isNaN(id)) {
      return res.status(400).json({
        message: 'ID inválido',
      });
    }

    const notification = await notificationService.markPopupAsSeen(
      req.user.id,
      id,
    );

    res.json(notification);
  } catch (error) {
    res.status(404).json({
      message:
        error instanceof Error
          ? error.message
          : 'Error al marcar la notificación emergente como vista',
    });
  }
}
