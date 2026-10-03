import type { Response } from 'express';

import type { AuthRequest } from '@/middlewares/auth.middleware';

import {
  addManualCashMovement,
  getCashMovements,
} from './cash-movement.service';

export async function getMovements(_req: AuthRequest, res: Response) {
  try {
    const movements = await getCashMovements();

    return res.json(movements);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Error al obtener los movimientos de caja';

    return res.status(400).json({ message });
  }
}

export async function createMovement(req: AuthRequest, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({
        message: 'No autenticado',
      });
    }

    const { tipo, categoriaId, concepto, importe, fecha, observaciones } =
      req.body;

    const movement = await addManualCashMovement({
      tipo,
      categoriaId: Number(categoriaId),
      concepto,
      importe: Number(importe),
      fecha: new Date(fecha),
      observaciones,
      registradoPorId: req.user.id,
    });

    return res.status(201).json(movement);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Error al registrar el movimiento de caja';

    return res.status(400).json({ message });
  }
}
