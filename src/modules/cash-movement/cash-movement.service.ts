import {
  CashMovementFilters,
  CreateManualCashMovementData,
} from '@/types/cash-movement.type';

import { findCashCategoryById } from '../cash-categories/cash-category.repository';
import {
  cancelCashMovement,
  createCashMovement,
  findCashMovementById,
  findCashMovements,
  getCashSummary,
} from './cash-movement.repository';

const RESERVED_FEE_CATEGORY = 'Cuotas de socios';

export async function getCashMovements(filters: CashMovementFilters = {}) {
  if (filters.tipo && filters.tipo !== 'INGRESO' && filters.tipo !== 'EGRESO') {
    throw new Error('El tipo de movimiento no es válido');
  }

  if (
    filters.categoriaId !== undefined &&
    (!Number.isInteger(filters.categoriaId) || filters.categoriaId <= 0)
  ) {
    throw new Error('La categoría no es válida');
  }

  if (
    filters.desde &&
    (!(filters.desde instanceof Date) || Number.isNaN(filters.desde.getTime()))
  ) {
    throw new Error('La fecha desde no es válida');
  }

  if (
    filters.hasta &&
    (!(filters.hasta instanceof Date) || Number.isNaN(filters.hasta.getTime()))
  ) {
    throw new Error('La fecha hasta no es válida');
  }

  if (filters.desde && filters.hasta && filters.desde > filters.hasta) {
    throw new Error('La fecha desde no puede ser posterior a la fecha hasta');
  }

  const buscar = filters.buscar?.trim();

  return findCashMovements({
    ...filters,
    buscar: buscar || undefined,
  });
}

export async function addManualCashMovement(
  data: CreateManualCashMovementData,
) {
  if (data.tipo !== 'INGRESO' && data.tipo !== 'EGRESO') {
    throw new Error('El tipo de movimiento no es válido');
  }

  if (!Number.isInteger(data.categoriaId) || data.categoriaId <= 0) {
    throw new Error('La categoría no es válida');
  }

  const concepto = data.concepto?.trim();

  if (!concepto) {
    throw new Error('El concepto es obligatorio');
  }

  if (concepto.length > 255) {
    throw new Error('El concepto no puede superar los 255 caracteres');
  }

  if (!Number.isFinite(data.importe) || data.importe <= 0) {
    throw new Error('El importe debe ser mayor a cero');
  }

  if (!(data.fecha instanceof Date) || Number.isNaN(data.fecha.getTime())) {
    throw new Error('La fecha no es válida');
  }

  const category = await findCashCategoryById(data.categoriaId);

  if (!category) {
    throw new Error('La categoría no existe');
  }

  if (!category.activa) {
    throw new Error('La categoría está inactiva');
  }

  if (category.tipo !== data.tipo) {
    throw new Error('La categoría no corresponde al tipo de movimiento');
  }

  if (
    category.tipo === 'INGRESO' &&
    category.nombre === RESERVED_FEE_CATEGORY
  ) {
    throw new Error(
      'La categoría de cuotas de socios no puede utilizarse manualmente',
    );
  }

  const observaciones = data.observaciones?.trim() || undefined;

  if (observaciones && observaciones.length > 500) {
    throw new Error('Las observaciones no pueden superar los 500 caracteres');
  }

  return createCashMovement({
    tipo: data.tipo,
    categoriaId: data.categoriaId,
    concepto,
    importe: data.importe,
    fecha: data.fecha,
    observaciones,
    registradoPorId: data.registradoPorId,
  });
}

export async function getCurrentMonthCashSummary() {
  const now = new Date();

  const startDate = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  );

  const endDate = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
  );

  const summary = await getCashSummary(startDate, endDate);

  const income = summary.find((item) => item.tipo === 'INGRESO');
  const expense = summary.find((item) => item.tipo === 'EGRESO');

  const ingresos = Number(income?._sum.importe ?? 0);
  const egresos = Number(expense?._sum.importe ?? 0);

  return {
    ingresos,
    egresos,
    balance: ingresos - egresos,
    cantidadMovimientos: (income?._count.id ?? 0) + (expense?._count.id ?? 0),
  };
}

export async function cancelManualCashMovement(
  id: number,
  userId: number,
  reason: string,
) {
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error('El movimiento no es válido');
  }

  const movement = await findCashMovementById(id);

  if (!movement) {
    throw new Error('El movimiento no existe');
  }

  if (movement.anulado) {
    throw new Error('El movimiento ya está anulado');
  }

  if (movement.pagoCuotaId) {
    throw new Error(
      'Los movimientos asociados a cuotas no pueden anularse desde caja',
    );
  }

  const cancellationReason = reason?.trim();

  if (!cancellationReason) {
    throw new Error('El motivo de anulación es obligatorio');
  }

  if (cancellationReason.length > 500) {
    throw new Error(
      'El motivo de anulación no puede superar los 500 caracteres',
    );
  }

  return cancelCashMovement(id, userId, cancellationReason);
}
