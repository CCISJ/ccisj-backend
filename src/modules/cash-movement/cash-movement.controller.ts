import type { Response } from 'express';

import type { AuthRequest } from '@/middlewares/auth.middleware';
import { singleQueryParam } from '@/utils/params';
import { sendError } from '@/utils/send-error';

import {
  addManualCashMovement,
  cancelManualCashMovement,
  getCashMovements,
  getCurrentMonthCashSummary,
} from './cash-movement.service';

export async function getMovements(req: AuthRequest, res: Response) {
  try {
    const desde = singleQueryParam(req.query.desde, 'desde');
    const hasta = singleQueryParam(req.query.hasta, 'hasta');
    const tipo = singleQueryParam(req.query.tipo, 'tipo');
    const categoriaId = singleQueryParam(req.query.categoriaId, 'categoriaId');
    const buscar = singleQueryParam(req.query.buscar, 'buscar');

    // El tipo se estrecha acá en lugar de castearlo: el `as 'INGRESO' |
    // 'EGRESO'` que había antes le afirmaba al compilador algo que nadie
    // había verificado. El service vuelve a validarlo igual, como segunda
    // barrera, y el mensaje es el mismo para que la respuesta no cambie.
    if (tipo !== undefined && tipo !== 'INGRESO' && tipo !== 'EGRESO') {
      throw new Error('El tipo de movimiento no es válido');
    }

    const movements = await getCashMovements({
      desde: desde ? new Date(desde) : undefined,
      hasta: hasta ? new Date(hasta) : undefined,
      tipo,
      categoriaId: categoriaId ? Number(categoriaId) : undefined,
      buscar,
    });

    return res.json(movements);
  } catch (error) {
    return sendError(res, error, {
      status: 400,
      message: 'Error al obtener los movimientos de caja',
    });
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
    return sendError(res, error, {
      status: 400,
      message: 'Error al registrar el movimiento de caja',
    });
  }
}

export async function getCashSummary(_req: AuthRequest, res: Response) {
  try {
    const summary = await getCurrentMonthCashSummary();

    return res.json(summary);
  } catch (error) {
    return sendError(res, error, {
      status: 400,
      message: 'Error al obtener el resumen de caja',
    });
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
    return sendError(res, error, {
      status: 400,
      message: 'Error al anular el movimiento de caja',
    });
  }
}
