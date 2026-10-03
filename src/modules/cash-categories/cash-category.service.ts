import type { TipoMovimientoCaja } from '@/generated/prisma/enums';

import {
  createCashCategory,
  deactivateCashCategory,
  findCashCategories,
  findCashCategoryById,
  findCashCategoryByNameAndType,
} from './cash-category.repository';

const RESERVED_FEE_CATEGORY = 'Cuotas de socios';

export async function getCashCategories() {
  return findCashCategories();
}

export async function addCashCategory(data: {
  nombre: string;
  tipo: TipoMovimientoCaja;
}) {
  const nombre = data.nombre?.trim();

  if (!nombre) {
    throw new Error('El nombre de la categoría es obligatorio');
  }

  if (nombre.length > 100) {
    throw new Error(
      'El nombre de la categoría no puede superar los 100 caracteres',
    );
  }

  if (data.tipo !== 'INGRESO' && data.tipo !== 'EGRESO') {
    throw new Error('El tipo de categoría no es válido');
  }

  const existing = await findCashCategoryByNameAndType(nombre, data.tipo);

  if (existing) {
    throw new Error('Ya existe una categoría con ese nombre y tipo');
  }

  return createCashCategory({
    nombre,
    tipo: data.tipo,
  });
}

export async function removeCashCategory(id: number) {
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error('La categoría no es válida');
  }

  const category = await findCashCategoryById(id);

  if (!category) {
    throw new Error('La categoría no existe');
  }

  if (!category.activa) {
    throw new Error('La categoría ya está inactiva');
  }

  if (
    category.tipo === 'INGRESO' &&
    category.nombre === RESERVED_FEE_CATEGORY
  ) {
    throw new Error('La categoría de cuotas de socios no se puede eliminar');
  }

  return deactivateCashCategory(id);
}
