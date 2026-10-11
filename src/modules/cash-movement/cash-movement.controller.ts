import type { Response } from 'express';

import type { AuthRequest } from '@/middlewares/auth.middleware';

import {
  addManualCashMovement,
  cancelManualCashMovement,
  getCashMovementReceipt,
  getCashMovements,
  getCurrentMonthCashSummary,
  uploadCashMovementReceipt,
} from './cash-movement.service';

export async function getMovements(req: AuthRequest, res: Response) {
  try {
    const { desde, hasta, tipo, categoriaId, buscar } = req.query;

    const movements = await getCashMovements({
      desde: desde ? new Date(String(desde)) : undefined,
      hasta: hasta ? new Date(String(hasta)) : undefined,
      tipo: tipo ? (String(tipo) as 'INGRESO' | 'EGRESO') : undefined,
      categoriaId: categoriaId ? Number(categoriaId) : undefined,
      buscar: buscar ? String(buscar) : undefined,
    });

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

export async function getCashSummary(_req: AuthRequest, res: Response) {
  try {
    const summary = await getCurrentMonthCashSummary();

    return res.json(summary);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Error al obtener el resumen de caja';

    return res.status(400).json({ message });
  }
}

export async function cancelMovement(req: AuthRequest, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({
        message: 'No autenticado',
      });
    }

    const id = Number(req.params.id);
    const { motivo } = req.body;

    const movement = await cancelManualCashMovement(id, req.user.id, motivo);

    return res.json(movement);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Error al anular el movimiento de caja';

    return res.status(400).json({ message });
  }
}

export async function uploadMovementReceipt(req: AuthRequest, res: Response) {
  try {
    const id = Number(req.params.id);

    if (!req.file) {
      return res.status(400).json({
        message: 'El comprobante es obligatorio',
      });
    }

    const result = await uploadCashMovementReceipt(id, req.file);

    return res.status(200).json({
      message: 'Comprobante guardado correctamente',
      ...result,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Error al subir el comprobante';

    return res.status(400).json({ message });
  }
}

export async function getMovementReceipt(req: AuthRequest, res: Response) {
  try {
    const id = Number(req.params.id);

    const result = await getCashMovementReceipt(id);

    return res.json(result);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Error al obtener el comprobante';

    return res.status(400).json({ message });
  }
}
