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

export function findByName(nombre: string) {
  return prisma.categoria.findUnique({
    where: { nombre },
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

export function create(data: { nombre: string; descripcion?: string }) {
  return prisma.categoria.create({
    data,
  });
}

export function update(
  id: number,
  data: {
    nombre?: string;
    descripcion?: string;
    activa?: boolean;
  },
) {
  return prisma.categoria.update({
    where: { id },
    data,
  });
}

export function remove(id: number) {
  return prisma.categoria.delete({
    where: { id },
  });
}
