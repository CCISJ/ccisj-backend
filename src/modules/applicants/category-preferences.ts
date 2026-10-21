import * as categoryRepository from '@/modules/categories/category.repository';
import { HttpError } from '@/utils/http-error';

/**
 * Categorías de las que el postulante quiere recibir ofertas. Ausente o
 * vacía significa "todas" y no se guarda ninguna fila: así una categoría
 * nueva también le llega a quien eligió todas.
 */
export async function parseCategoryPreferences(value: unknown) {
  if (value === undefined || value === null) return [];

  if (
    !Array.isArray(value) ||
    !value.every((id) => Number.isInteger(id) && id > 0)
  ) {
    throw new HttpError(400, 'Las categorías no son válidas');
  }

  const ids = [...new Set(value as number[])];

  if (ids.length === 0) return [];

  const categories = await categoryRepository.findByIds(ids);

  if (
    categories.length !== ids.length ||
    categories.some((category) => !category.activa)
  ) {
    throw new HttpError(400, 'Una o más categorías no existen');
  }

  // Si eligió todas las activas, es lo mismo que "todas".
  const active = await categoryRepository.findActive();

  return active.every((category) => ids.includes(category.id)) ? [] : ids;
}
