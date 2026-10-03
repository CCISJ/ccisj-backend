import { CreateManualCashMovementData } from '@/types/cash-movement.type';

import { findCashCategoryById } from '../cash-categories/cash-category.repository';
import {
  createCashMovement,
  findCashMovements,
} from './cash-movement.repository';

const RESERVED_FEE_CATEGORY = 'Cuotas de socios';

export async function getCashMovements() {
  return findCashMovements();
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
