import { AddFeeAdjustmentData, RegisterFeePaymentData } from '@/types/fee.type';
import { HttpError } from '@/utils/http-error';

import {
  deleteReceiptFromStorage,
  uploadFeePaymentReceiptToStorage,
} from '../cash-movement/receipt-storage.service';
import {
  findActive,
  findById as findMemberById,
} from '../members/member.repository';
import {
  cancelFeePayment,
  createFee,
  createFeeAdjustmentWithRecalculation,
  createFeeConfiguration,
  createFeePayment,
  deactivateFeeAdjustmentWithRecalculation,
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

type FeeAdjustmentForCalculation = {
  tipo: 'ADICIONAL' | 'DESCUENTO';
  importe: { toString(): string };
};

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

// Las consultas por socio devolvían 200 con una lista vacía (o "al día") para
// un socio que no existe, igual que para uno sin cuotas: quien consulta no
// puede distinguir los dos casos. El resto del sistema responde 404.
async function assertMemberExists(socioId: number) {
  const member = await findMemberById(socioId);

  if (!member) {
    throw new HttpError(404, 'Socio no encontrado');
  }
}

export async function getMemberFees(socioId: number) {
  if (!Number.isInteger(socioId) || socioId <= 0) {
    throw new Error('El socio no es válido');
  }

  await assertMemberExists(socioId);

  return findMemberFees(socioId);
}

export async function getMemberFeeAdjustments(socioId: number) {
  if (!Number.isInteger(socioId) || socioId <= 0) {
    throw new Error('El socio no es válido');
  }

  await assertMemberExists(socioId);

  return findMemberFeeAdjustments(socioId);
}

export async function getMemberFeeStatus(socioId: number, today = new Date()) {
  if (!Number.isInteger(socioId) || socioId <= 0) {
    throw new Error('El socio no es válido');
  }

  if (Number.isNaN(today.getTime())) {
    throw new Error('La fecha no es válida');
  }

  await assertMemberExists(socioId);

  const fees = await findMemberFeesWithPayments(socioId);

  const todayDate = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
  );

  const pendingFees = fees
    .filter((fee) => fee.estado !== 'ANULADA')
    .map((fee) => {
      const totalPaid = fee.pagos.reduce(
        (total, detail) => total + Number(detail.importeAplicado),
        0,
      );

      return {
        fechaVencimiento: fee.fechaVencimiento,
        balance: Number(fee.importeTotal) - totalPaid,
      };
    })
    .filter((fee) => fee.balance > 0);

  const overdueFees = pendingFees.filter(
    (fee) => fee.fechaVencimiento < todayDate,
  );

  let estado: 'AL_DIA' | 'PENDIENTE' | 'DEUDOR';

  if (overdueFees.length === 0) {
    estado = 'AL_DIA';
  } else if (overdueFees.length <= 2) {
    estado = 'PENDIENTE';
  } else {
    estado = 'DEUDOR';
  }

  const deudaTotal = pendingFees.reduce((total, fee) => total + fee.balance, 0);

  const deudaVencida = overdueFees.reduce(
    (total, fee) => total + fee.balance,
    0,
  );

  return {
    estado,
    cuotasPendientes: pendingFees.length,
    deudaTotal,
    cuotasVencidas: overdueFees.length,
    deudaVencida,
  };
}

export async function getMemberFeePayments(socioId: number) {
  if (!Number.isInteger(socioId) || socioId <= 0) {
    throw new Error('El socio no es válido');
  }

  await assertMemberExists(socioId);

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

export async function addFeeConfiguration(
  importeBase: number,
  vigenciaDesde: Date,
) {
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

  // Después de validar la fecha, no antes: con una fecha inválida esta
  // consulta la rechaza Prisma, y la respuesta era un 500 en vez del
  // "La fecha de vigencia no es válida" de arriba.
  const existingConfiguration =
    await findConfigurationByEffectiveDate(vigenciaDesde);

  if (existingConfiguration) {
    throw new Error(
      `Ya existe una configuración de cuota para el año ${vigenciaDesde.getUTCFullYear()}`,
    );
  }

  return createFeeConfiguration(importeBase, vigenciaDesde);
}

export function calculateFeeTotals(
  importeBase: number,
  adjustments: FeeAdjustmentForCalculation[],
) {
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

  return {
    importeAjustes,
    importeTotal,
  };
}

async function calculateFeeAmounts(
  socioId: number,
  periodoDesde: Date,
  periodoHasta: Date,
  importeBase: number,
) {
  const adjustments = await findActiveFeeAdjustments(
    socioId,
    periodoDesde,
    periodoHasta,
  );

  return calculateFeeTotals(importeBase, adjustments);
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

  const importeBase = Number(configuration.importeBase);

  const { importeAjustes, importeTotal } = await calculateFeeAmounts(
    socioId,
    periodoDesde,
    periodoHasta,
    importeBase,
  );

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

  return createFeeAdjustmentWithRecalculation({
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
    comprobante,
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

  if (medioPago.trim().toUpperCase() === 'TARJETA' && !comprobante) {
    throw new Error('El comprobante es obligatorio para pagos con tarjeta');
  }

  // Los mismos largos que la base (`VarChar(50)` y `VarChar(500)`), como en
  // los movimientos de caja. Sin esto llegaban a la base, que los rechazaba
  // con el 400 genérico "Uno de los datos es demasiado largo". Van antes de
  // subir el comprobante: un pago inválido no deja archivos en Storage.
  if (medioPago.trim().length > 50) {
    throw new Error('El medio de pago no puede superar los 50 caracteres');
  }

  if (observaciones !== undefined && typeof observaciones !== 'string') {
    throw new Error('Las observaciones no son válidas');
  }

  if (observaciones && observaciones.trim().length > 500) {
    throw new Error('Las observaciones no pueden superar los 500 caracteres');
  }

  // El comprobante se sube recién acá, con todas las validaciones pasadas, y
  // antes de grabar: así el pago y su movimiento de caja se crean ya con él
  // en la misma transacción, y un pago con tarjeta nunca queda sin
  // comprobante. Si la transacción falla, se borra el archivo para que no
  // quede huérfano en Storage.
  const comprobanteUrl = comprobante
    ? await uploadFeePaymentReceiptToStorage(socioId, comprobante)
    : undefined;

  try {
    return await createFeePayment({
      socioId,
      registradoPorId,
      importe,
      fechaPago,
      medioPago: medioPago.trim(),
      comprobanteUrl,
      observaciones: observaciones?.trim() || undefined,
    });
  } catch (error) {
    if (comprobanteUrl) {
      try {
        await deleteReceiptFromStorage(comprobanteUrl);
      } catch (cleanupError) {
        console.error(
          'No se pudo limpiar el comprobante subido:',
          cleanupError,
        );
      }
    }

    throw error;
  }
}

export async function cancelMemberFeePayment(
  pagoId: number,
  anuladoPorId: number,
  motivoAnulacion: string,
) {
  if (!Number.isInteger(pagoId) || pagoId <= 0) {
    throw new Error('El pago no es válido');
  }

  if (!Number.isInteger(anuladoPorId) || anuladoPorId <= 0) {
    throw new Error('El usuario no es válido');
  }

  const motivo = motivoAnulacion?.trim();

  if (!motivo) {
    throw new Error('El motivo de anulación es obligatorio');
  }

  if (motivo.length > 500) {
    throw new Error(
      'El motivo de anulación no puede superar los 500 caracteres',
    );
  }

  return cancelFeePayment(pagoId, anuladoPorId, motivo);
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

  // Se controla antes de guardar: si se controlara después, el importe de una
  // configuración ya vigente quedaría cambiado aunque la respuesta sea un error.
  if (configuration.vigenciaDesde <= new Date()) {
    throw new Error(
      'Solo se pueden modificar configuraciones de cuota futuras',
    );
  }

  return updateFeeConfiguration(id, importeBase);
}

export async function removeFeeAdjustment(adjustmentId: number) {
  if (!Number.isInteger(adjustmentId) || adjustmentId <= 0) {
    throw new Error('El ajuste no es válido');
  }

  return deactivateFeeAdjustmentWithRecalculation(adjustmentId);
}
