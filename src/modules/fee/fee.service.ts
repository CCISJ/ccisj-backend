import { RegisterFeePaymentData, TipoAjusteCuota } from '@/types/fee.type';

import { findActive } from '../members/member.repository';
import {
  createFee,
  createFeeAdjustment,
  createFeeConfiguration,
  createFeePayment,
  deleteFeePayment,
  findActiveFeeAdjustments,
  findAllFeesWithPayments,
  findConfigurationByEffectiveDate,
  findCurrentFeeConfiguration,
  findFeeByMemberAndPeriod,
  findFeeConfigurationById,
  findFeeConfigurationForDate,
  findFeeConfigurationHistory,
  findMemberFeeAdjustments,
  findMemberFeePayments,
  findMemberFees,
  findMemberFeesWithPayments,
  findPaymentsByDateRange,
  getRecentPayments,
  updateFeeConfiguration,
} from './fee.repository';

export async function getCurrentFeeConfiguration() {
  const configuration = await findCurrentFeeConfiguration();

  if (!configuration) {
    throw new Error('No existe una configuración de cuota vigente');
  }

  return configuration;
}

export async function getFeeConfigurationHistory() {
  return findFeeConfigurationHistory();
}

export async function addFeeConfiguration(
  importeBase: number,
  vigenciaDesde: Date,
) {
  const existingConfiguration =
    await findConfigurationByEffectiveDate(vigenciaDesde);

  if (existingConfiguration) {
    throw new Error(
      `Ya existe una configuración de cuota para el año ${vigenciaDesde.getUTCFullYear()}`,
    );
  }

  if (!Number.isFinite(importeBase) || importeBase <= 0) {
    throw new Error('El importe de la cuota debe ser mayor a 0');
  }

  if (Number.isNaN(vigenciaDesde.getTime())) {
    throw new Error('La fecha de vigencia no es válida');
  }

  if (vigenciaDesde.getUTCMonth() !== 0 || vigenciaDesde.getUTCDate() !== 1) {
    throw new Error(
      'La nueva configuración de cuota debe comenzar el 1 de enero',
    );
  }

  return createFeeConfiguration(importeBase, vigenciaDesde);
}

export async function getMemberFees(socioId: number) {
  if (!Number.isInteger(socioId) || socioId <= 0) {
    throw new Error('El socio no es válido');
  }

  return findMemberFees(socioId);
}

export async function generateMonthlyFee(
  socioId: number,
  year: number,
  month: number,
) {
  if (!Number.isInteger(socioId) || socioId <= 0) {
    throw new Error('El socio no es válido');
  }

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    month < 1 ||
    month > 12
  ) {
    throw new Error('El período de la cuota no es válido');
  }

  const periodoDesde = new Date(Date.UTC(year, month - 1, 1));
  const periodoHasta = new Date(Date.UTC(year, month, 0));

  const existingFee = await findFeeByMemberAndPeriod(socioId, periodoDesde);

  if (existingFee) {
    throw new Error('Ya existe una cuota para ese socio y período');
  }

  const configuration = await findFeeConfigurationForDate(periodoDesde);

  if (!configuration) {
    throw new Error('No existe una configuración de cuota para ese período');
  }

  const adjustments = await findActiveFeeAdjustments(
    socioId,
    periodoDesde,
    periodoHasta,
  );

  const importeBase = Number(configuration.importeBase);

  const importeAjustes = adjustments.reduce((total, adjustment) => {
    const importe = Number(adjustment.importe);

    return adjustment.tipo === 'ADICIONAL' ? total + importe : total - importe;
  }, 0);

  const importeTotal = importeBase + importeAjustes;

  if (importeTotal < 0) {
    throw new Error(
      'Los ajustes no pueden generar una cuota con importe negativo',
    );
  }

  return createFee({
    socioId,
    periodoDesde,
    periodoHasta,

    fechaVencimiento: periodoHasta,

    importeBase,
    importeAjustes,
    importeTotal,
  });
}

export async function generateMonthlyFees(year: number, month: number) {
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    month < 1 ||
    month > 12
  ) {
    throw new Error('El período de las cuotas no es válido');
  }

  const members = await findActive();

  const results = {
    generated: 0,
    skipped: 0,
  };

  for (const member of members) {
    const periodoDesde = new Date(Date.UTC(year, month - 1, 1));

    const existingFee = await findFeeByMemberAndPeriod(member.id, periodoDesde);

    if (existingFee) {
      results.skipped++;
      continue;
    }

    await generateMonthlyFee(member.id, year, month);
    results.generated++;
  }

  return results;
}

export async function getMemberFeeAdjustments(socioId: number) {
  if (!Number.isInteger(socioId) || socioId <= 0) {
    throw new Error('El socio no es válido');
  }

  return findMemberFeeAdjustments(socioId);
}

type AddFeeAdjustmentData = {
  socioId: number;
  tipo: TipoAjusteCuota;
  importe: number;
  fechaDesde: Date;
  fechaHasta?: Date;
  motivo?: string;
};

export async function addFeeAdjustment(data: AddFeeAdjustmentData) {
  const { socioId, tipo, importe, fechaDesde, fechaHasta, motivo } = data;

  if (!Number.isInteger(socioId) || socioId <= 0) {
    throw new Error('El socio no es válido');
  }

  if (tipo !== 'ADICIONAL' && tipo !== 'DESCUENTO') {
    throw new Error('El tipo de ajuste no es válido');
  }

  if (!Number.isFinite(importe) || importe <= 0) {
    throw new Error('El importe del ajuste debe ser mayor a 0');
  }

  if (Number.isNaN(fechaDesde.getTime())) {
    throw new Error('La fecha de inicio no es válida');
  }

  if (fechaHasta && Number.isNaN(fechaHasta.getTime())) {
    throw new Error('La fecha de finalización no es válida');
  }

  if (fechaHasta && fechaHasta < fechaDesde) {
    throw new Error(
      'La fecha de finalización no puede ser anterior a la fecha de inicio',
    );
  }

  return createFeeAdjustment({
    socioId,
    tipo,
    importe,
    fechaDesde,
    fechaHasta,
    motivo: motivo?.trim() || undefined,
  });
}

export async function registerFeePayment(data: RegisterFeePaymentData) {
  const {
    socioId,
    registradoPorId,
    importe,
    fechaPago,
    medioPago,
    numeroRecibo,
    observaciones,
  } = data;

  if (!Number.isInteger(socioId) || socioId <= 0) {
    throw new Error('El socio no es válido');
  }

  if (!Number.isInteger(registradoPorId) || registradoPorId <= 0) {
    throw new Error('El usuario que registra el pago no es válido');
  }

  if (!Number.isFinite(importe) || importe <= 0) {
    throw new Error('El importe del pago debe ser mayor a 0');
  }

  if (Number.isNaN(fechaPago.getTime())) {
    throw new Error('La fecha de pago no es válida');
  }

  if (!medioPago?.trim()) {
    throw new Error('El medio de pago es obligatorio');
  }

  const fees = await findMemberFeesWithPayments(socioId);

  const pendingFees = fees
    .map((fee) => {
      const paid = fee.pagos.reduce(
        (total, payment) => total + Number(payment.importeAplicado),
        0,
      );

      const balance = Number(fee.importeTotal) - paid;

      return {
        fee,
        balance,
      };
    })
    .filter(({ fee, balance }) => {
      return fee.estado !== 'ANULADA' && balance > 0;
    });

  if (pendingFees.length === 0) {
    throw new Error('El socio no tiene cuotas pendientes');
  }

  const totalDebt = pendingFees.reduce(
    (total, { balance }) => total + balance,
    0,
  );

  if (importe > totalDebt) {
    throw new Error('El importe del pago no puede superar la deuda pendiente');
  }

  let remaining = importe;

  const details: {
    cuotaId: number;
    importeAplicado: number;
    estadoResultante: 'PARCIAL' | 'PAGADA';
  }[] = [];

  for (const { fee, balance } of pendingFees) {
    if (remaining <= 0) break;

    const applied = Math.min(remaining, balance);

    const newBalance = balance - applied;

    details.push({
      cuotaId: fee.id,
      importeAplicado: applied,
      estadoResultante: newBalance <= 0 ? 'PAGADA' : 'PARCIAL',
    });

    remaining -= applied;
  }

  const payment = await createFeePayment({
    socioId,
    registradoPorId,
    importe,
    fechaPago,
    medioPago: medioPago.trim(),
    numeroRecibo: numeroRecibo?.trim() || undefined,
    observaciones: observaciones?.trim() || undefined,
    detalles: details,
  });

  return payment;
}

export async function removeFeePayment(pagoId: number) {
  if (!Number.isInteger(pagoId) || pagoId <= 0) {
    throw new Error('El pago no es válido');
  }

  return deleteFeePayment(pagoId);
}

export async function getMemberFeeStatus(socioId: number, today = new Date()) {
  if (!Number.isInteger(socioId) || socioId <= 0) {
    throw new Error('El socio no es válido');
  }

  if (Number.isNaN(today.getTime())) {
    throw new Error('La fecha no es válida');
  }

  const fees = await findMemberFeesWithPayments(socioId);

  const todayDate = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
  );

  const overdueFees = fees.filter((fee) => {
    if (fee.estado === 'ANULADA') {
      return false;
    }

    if (fee.fechaVencimiento >= todayDate) {
      return false;
    }

    const totalPaid = fee.pagos.reduce(
      (total, detail) => total + Number(detail.importeAplicado),
      0,
    );

    const balance = Number(fee.importeTotal) - totalPaid;

    return balance > 0;
  });

  let estado: 'AL_DIA' | 'PENDIENTE' | 'DEUDOR';

  if (overdueFees.length === 0) {
    estado = 'AL_DIA';
  } else if (overdueFees.length <= 2) {
    estado = 'PENDIENTE';
  } else {
    estado = 'DEUDOR';
  }

  const deudaVencida = overdueFees.reduce((total, fee) => {
    const totalPaid = fee.pagos.reduce(
      (paid, detail) => paid + Number(detail.importeAplicado),
      0,
    );

    return total + (Number(fee.importeTotal) - totalPaid);
  }, 0);

  return {
    estado,
    cuotasVencidas: overdueFees.length,
    deudaVencida,
  };
}

export async function getMemberFeePayments(socioId: number) {
  if (!Number.isInteger(socioId) || socioId <= 0) {
    throw new Error('El socio no es válido');
  }

  return findMemberFeePayments(socioId);
}

export async function getFeesDashboardSummary(today = new Date()) {
  if (Number.isNaN(today.getTime())) {
    throw new Error('La fecha no es válida');
  }

  const todayDate = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
  );

  const monthStart = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1),
  );

  const monthEnd = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 1),
  );

  const [fees, payments, activeMembers] = await Promise.all([
    findAllFeesWithPayments(),
    findPaymentsByDateRange(monthStart, monthEnd),
    findActive(),
  ]);

  const cobradoMes = payments.reduce(
    (total, payment) => total + Number(payment.importe),
    0,
  );

  const pendiente = fees.reduce((total, fee) => {
    if (!fee.socio.usuario.activo || fee.estado === 'ANULADA') {
      return total;
    }

    const totalPaid = fee.pagos.reduce(
      (paid, detail) => paid + Number(detail.importeAplicado),
      0,
    );

    const balance = Number(fee.importeTotal) - totalPaid;

    return total + Math.max(balance, 0);
  }, 0);

  const memberDebts = new Map<
    number,
    {
      overdueFees: number;
      overdueDebt: number;
    }
  >(
    activeMembers.map((member) => [
      member.id,
      {
        overdueFees: 0,
        overdueDebt: 0,
      },
    ]),
  );

  for (const fee of fees) {
    if (!fee.socio.usuario.activo) {
      continue;
    }

    if (fee.estado === 'ANULADA' || fee.fechaVencimiento >= todayDate) {
      continue;
    }

    const totalPaid = fee.pagos.reduce(
      (total, detail) => total + Number(detail.importeAplicado),
      0,
    );

    const balance = Number(fee.importeTotal) - totalPaid;

    if (balance <= 0) {
      continue;
    }

    const member = memberDebts.get(fee.socioId);

    if (!member) {
      continue;
    }

    member.overdueFees++;
    member.overdueDebt += balance;
  }

  let sociosAlDia = 0;
  let sociosPendientes = 0;
  let sociosDeudores = 0;

  for (const member of memberDebts.values()) {
    if (member.overdueFees === 0) {
      sociosAlDia++;
    } else if (member.overdueFees <= 2) {
      sociosPendientes++;
    } else {
      sociosDeudores++;
    }
  }

  const deudaTotal = [...memberDebts.values()].reduce(
    (total, member) => total + member.overdueDebt,
    0,
  );

  return {
    cobradoMes,
    pendiente,
    deudaTotal,
    sociosAlDia,
    sociosPendientes,
    sociosDeudores,
  };
}

export async function getRecentFeePayments(limit: number = 5) {
  const payments = await getRecentPayments(limit);

  return payments.map((payment) => ({
    id: payment.id,
    socioId: payment.socioId,
    razonSocial: payment.socio.razonSocial,
    importe: Number(payment.importe),
    fechaPago: payment.fechaPago,
  }));
}

export async function editFeeConfiguration(id: number, importeBase: number) {
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error('El ID de la configuración no es válido');
  }

  if (!Number.isFinite(importeBase) || importeBase <= 0) {
    throw new Error('El importe de la cuota debe ser mayor a 0');
  }

  const configuration = await findFeeConfigurationById(id);

  if (!configuration) {
    throw new Error('La configuración de cuota no existe');
  }

  return updateFeeConfiguration(id, importeBase);
}
