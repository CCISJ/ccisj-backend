import { prisma } from '@/config/prisma';

export function findAll() {
  return prisma.categoria.findMany({
    orderBy: {
      nombre: 'asc',
    },
  });
}

export function findById(id: number) {
  return prisma.categoria.findUnique({
    where: { id },
  });
}

/** Sin distinguir mayúsculas: "Ventas" y "ventas" son la misma categoría. */
export function findByName(nombre: string) {
  return prisma.categoria.findFirst({
    where: {
      nombre: {
        equals: nombre,
        mode: 'insensitive',
      },
    },
  });
}

export function findByIds(ids: number[]) {
  return prisma.categoria.findMany({
    where: {
      id: {
        in: ids,
      },
    },
  });
}

export function create(data: { nombre: string; descripcion: string | null }) {
  return prisma.categoria.create({
    data,
  });
}

export function update(
  id: number,
  data: {
    nombre?: string;
    descripcion?: string | null;
    activa?: boolean;
  },
) {
  return prisma.categoria.update({
    where: { id },
    data,
  });
}
