import { prisma } from '@/config/prisma';
import type { TipoMovimientoCaja } from '@/generated/prisma/enums';

export async function findCashCategories() {
  return prisma.categoriaCaja.findMany({
    orderBy: [{ tipo: 'asc' }, { nombre: 'asc' }],
  });
}

export async function findActiveCashCategories() {
  return prisma.categoriaCaja.findMany({
    where: {
      activa: true,
    },
    orderBy: [{ tipo: 'asc' }, { nombre: 'asc' }],
  });
}

export async function findCashCategoryById(id: number) {
  return prisma.categoriaCaja.findUnique({
    where: { id },
  });
}

export async function findCashCategoryByNameAndType(
  nombre: string,
  tipo: TipoMovimientoCaja,
) {
  return prisma.categoriaCaja.findUnique({
    where: {
      nombre_tipo: {
        nombre,
        tipo,
      },
    },
  });
}

export async function createCashCategory(data: {
  nombre: string;
  tipo: TipoMovimientoCaja;
}) {
  return prisma.categoriaCaja.create({
    data,
  });
}

export async function deactivateCashCategory(id: number) {
  return prisma.categoriaCaja.update({
    where: { id },
    data: {
      activa: false,
    },
  });
}
