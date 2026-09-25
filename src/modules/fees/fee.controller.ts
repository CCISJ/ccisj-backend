import type { Request, Response } from 'express';

import { AuthRequest } from '@/middlewares/auth.middleware';

import {
  addFeeAdjustment,
  addFeeConfiguration,
  editFeeConfiguration,
  generateMonthlyFee,
  getCurrentFeeConfiguration,
  getFeeConfigurationHistory,
  getFeesDashboardSummary,
  getMemberFeeAdjustments,
  getMemberFeePayments,
  getMemberFeeStatus,
  getMemberFees,
  getRecentFeePayments,
  registerFeePayment,
  removeFeeAdjustment,
  removeFeePayment,
} from './fee.service';

export async function getCurrentConfiguration(_req: Request, res: Response) {
  try {
    const configuration = await getCurrentFeeConfiguration();

    return res.json(configuration);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Error al obtener la configuración de cuota';

    return res.status(500).json({ message });
  }
}

export async function getConfigurationHistory(_req: Request, res: Response) {
  try {
    const configurations = await getFeeConfigurationHistory();

    return res.json(configurations);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Error al obtener el historial de cuotas';

    return res.status(500).json({ message });
  }
}

export async function createConfiguration(req: Request, res: Response) {
  try {
    const { importeBase, vigenciaDesde } = req.body;

    if (importeBase === undefined || !vigenciaDesde) {
      return res.status(400).json({
        message: 'Importe base y fecha de vigencia son obligatorios',
      });
    }

    const configuration = await addFeeConfiguration(
      Number(importeBase),
      new Date(vigenciaDesde),
    );

    return res.status(201).json(configuration);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Error al crear la configuración de cuota';

    return res.status(400).json({ message });
  }
}

export async function getFeesByMember(req: Request, res: Response) {
  try {
    const socioId = Number(req.params.socioId);

    if (!Number.isInteger(socioId) || socioId <= 0) {
      return res.status(400).json({
        message: 'El socio no es válido',
      });
    }

    const fees = await getMemberFees(socioId);

    return res.json(fees);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Error al obtener las cuotas del socio';

    return res.status(500).json({ message });
  }
}

export async function createMonthlyFee(req: Request, res: Response) {
  try {
    const socioId = Number(req.params.socioId);
    const { year, month } = req.body;

    if (!Number.isInteger(socioId) || socioId <= 0) {
      return res.status(400).json({
        message: 'El socio no es válido',
      });
    }

    const fee = await generateMonthlyFee(socioId, Number(year), Number(month));

    return res.status(201).json(fee);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Error al generar la cuota';

    return res.status(400).json({ message });
  }
}

export async function getAdjustmentsByMember(req: Request, res: Response) {
  try {
    const socioId = Number(req.params.socioId);

    if (!Number.isInteger(socioId) || socioId <= 0) {
      return res.status(400).json({
        message: 'El socio no es válido',
      });
    }

    const adjustments = await getMemberFeeAdjustments(socioId);

    return res.json(adjustments);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Error al obtener los ajustes';

    return res.status(500).json({ message });
  }
}

export async function createAdjustment(req: Request, res: Response) {
  try {
    const socioId = Number(req.params.socioId);
    const { tipo, importe, fechaDesde, fechaHasta, motivo } = req.body;

    if (!Number.isInteger(socioId) || socioId <= 0) {
      return res.status(400).json({
        message: 'El socio no es válido',
      });
    }

    if (!tipo || importe === undefined || !fechaDesde) {
      return res.status(400).json({
        message: 'Tipo, importe y fecha de inicio son obligatorios',
      });
    }

    const adjustment = await addFeeAdjustment({
      socioId,
      tipo,
      importe: Number(importe),
      fechaDesde: new Date(fechaDesde),
      fechaHasta: fechaHasta ? new Date(fechaHasta) : undefined,
      motivo,
    });

    return res.status(201).json(adjustment);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Error al crear el ajuste';

    return res.status(400).json({ message });
  }
}

export async function createPayment(req: AuthRequest, res: Response) {
  try {
    const socioId = Number(req.params.socioId);

    if (!Number.isInteger(socioId) || socioId <= 0) {
      return res.status(400).json({
        message: 'El socio no es válido',
      });
    }

    if (!req.user) {
      return res.status(401).json({
        message: 'No autenticado',
      });
    }

    const { importe, fechaPago, medioPago, numeroRecibo, observaciones } =
      req.body;

    if (importe === undefined || !fechaPago || !medioPago) {
      return res.status(400).json({
        message: 'Importe, fecha de pago y medio de pago son obligatorios',
      });
    }

    const payment = await registerFeePayment({
      socioId,
      registradoPorId: req.user.id,
      importe: Number(importe),
      fechaPago: new Date(fechaPago),
      medioPago,
      numeroRecibo,
      observaciones,
    });

    return res.status(201).json(payment);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Error al registrar el pago';

    return res.status(400).json({ message });
  }
}

export async function deletePayment(req: Request, res: Response) {
  try {
    const pagoId = Number(req.params.pagoId);

    if (!Number.isInteger(pagoId) || pagoId <= 0) {
      return res.status(400).json({
        message: 'El pago no es válido',
      });
    }

    await removeFeePayment(pagoId);

    return res.status(204).send();
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Error al eliminar el pago';

    return res.status(400).json({ message });
  }
}

export async function getFeeStatusByMember(req: Request, res: Response) {
  try {
    const socioId = Number(req.params.socioId);

    if (!Number.isInteger(socioId) || socioId <= 0) {
      return res.status(400).json({
        message: 'El socio no es válido',
      });
    }

    const status = await getMemberFeeStatus(socioId);

    return res.json(status);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Error al obtener el estado de cuotas del socio';

    return res.status(500).json({ message });
  }
}

export async function getPaymentsByMember(req: Request, res: Response) {
  try {
    const socioId = Number(req.params.socioId);

    if (!Number.isInteger(socioId) || socioId <= 0) {
      return res.status(400).json({
        message: 'El socio no es válido',
      });
    }

    const payments = await getMemberFeePayments(socioId);

    return res.json(payments);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Error al obtener los pagos del socio';

    return res.status(500).json({ message });
  }
}

export async function getFeesDashboard(_req: Request, res: Response) {
  try {
    const summary = await getFeesDashboardSummary();

    return res.json(summary);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Error al obtener el resumen de cuotas';

    return res.status(500).json({ message });
  }
}

export async function getRecentPayments(req: Request, res: Response) {
  try {
    const payments = await getRecentFeePayments();

    res.json(payments);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Error al obtener los pagos recientes';

    return res.status(500).json({ message });
  }
}

export async function updateConfiguration(req: Request, res: Response) {
  try {
    const id = Number(req.params.id);
    const importeBase = Number(req.body.importeBase);

    const configuration = await editFeeConfiguration(id, importeBase);

    const today = new Date();

    if (configuration.vigenciaDesde <= today) {
      throw new Error(
        'Solo se pueden modificar configuraciones de cuota futuras',
      );
    }

    res.json(configuration);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Error al actualizar la configuración de cuota';

    return res.status(500).json({ message });
  }
}

export async function deleteAdjustment(req: Request, res: Response) {
  try {
    const adjustmentId = Number(req.params.adjustmentId);

    if (!Number.isInteger(adjustmentId) || adjustmentId <= 0) {
      return res.status(400).json({
        message: 'El ajuste no es válido',
      });
    }

    const result = await removeFeeAdjustment(adjustmentId);

    return res.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Error al eliminar el ajuste';

    return res.status(400).json({ message });
  }
}
