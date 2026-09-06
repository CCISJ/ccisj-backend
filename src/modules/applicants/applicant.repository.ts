import { prisma } from '@/config/prisma';

export function findAll() {
  return prisma.postulante.findMany({
    include: {
      usuario: {
        select: {
          id: true,
          email: true,
          activo: true,
        },
      },
      cv: true,
    },
    orderBy: {
      id: 'asc',
    },
  });
}

export function findById(id: number) {
  return prisma.postulante.findUnique({
    where: { id },
    include: {
      usuario: {
        select: {
          id: true,
          email: true,
          activo: true,
        },
      },
      cv: true,
    },
  });
}

export function findByUserId(usuarioId: number) {
  return prisma.postulante.findUnique({
    where: {
      usuarioId,
    },
  });
}

export function create(data: {
  usuarioId: number;
  nombre: string;
  apellido: string;
  telefono?: string;
}) {
  return prisma.postulante.create({
    data,
    include: {
      usuario: {
        select: {
          id: true,
          email: true,
          activo: true,
        },
      },
    },
  });
}

export function update(
  id: number,
  data: {
    nombre?: string;
    apellido?: string;
    telefono?: string;
  },
) {
  return prisma.postulante.update({
    where: { id },
    data,
    include: {
      usuario: {
        select: {
          id: true,
          email: true,
          activo: true,
        },
      },
      cv: true,
    },
  });
}

export function remove(id: number) {
  return prisma.postulante.delete({
    where: { id },
  });
}
