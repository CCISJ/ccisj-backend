import { prisma } from '@/config/prisma';
import { escapeLike } from '@/utils/like';

export function findAll() {
  return prisma.categoria.findMany({
    orderBy: {
      nombre: 'asc',
    },
  });
}

/** Las activas, solo id y nombre: es lo que se muestra sin sesión. */
export function findActive() {
  return prisma.categoria.findMany({
    where: { activa: true },
    select: { id: true, nombre: true },
    orderBy: { nombre: 'asc' },
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
        equals: escapeLike(nombre),
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
