import { prisma } from '@/config/prisma';

export function findAll() {
  return prisma.socio.findMany({
    include: {
      usuario: {
        select: {
          id: true,
          email: true,
          activo: true,
        },
      },
    },
    orderBy: {
      id: 'asc',
    },
  });
}

export function findById(id: number) {
  return prisma.socio.findUnique({
    where: { id },
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

export function findByRut(rut: string) {
  return prisma.socio.findUnique({
    where: { rut },
  });
}

export function create(data: {
  usuarioId: number;
  nombre: string;
  rut: string;
  email?: string;
  telefono?: string;
  direccion?: string;
  tipo?: 'COMUN' | 'DIRECTIVO';
}) {
  return prisma.socio.create({
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
    rut?: string;
    email?: string;
    telefono?: string;
    direccion?: string;
    tipo?: 'COMUN' | 'DIRECTIVO';
    activo?: boolean;
  },
) {
  return prisma.socio.update({
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
    },
  });
}

export function remove(id: number) {
  return prisma.socio.delete({
    where: { id },
  });
}
