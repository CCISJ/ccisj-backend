import { prisma } from '@/config/prisma';

export function findAll() {
  return prisma.usuario.findMany({
    select: {
      id: true,
      email: true,
      tipo: true,
      activo: true,
      fechaCreacion: true,
    },
    orderBy: {
      id: 'asc',
    },
  });
}

export function findById(id: number) {
  return prisma.usuario.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      tipo: true,
      activo: true,
      fechaCreacion: true,
    },
  });
}

export function findByEmail(email: string) {
  return prisma.usuario.findUnique({
    where: { email },
  });
}

export function findByIdWithMember(id: number) {
  return prisma.usuario.findUnique({
    where: { id },
    include: {
      socio: true,
    },
  });
}

export function create(data: {
  email: string;
  password: string;
  tipo: 'BACKOFFICE' | 'POSTULANTE' | 'SOCIO';
}) {
  return prisma.usuario.create({
    data,
    select: {
      id: true,
      email: true,
      tipo: true,
      activo: true,
      fechaCreacion: true,
    },
  });
}

export function update(
  id: number,
  data: {
    email?: string;
    tipo?: 'BACKOFFICE' | 'POSTULANTE' | 'SOCIO';
    activo?: boolean;
  },
) {
  return prisma.usuario.update({
    where: { id },
    data,
    select: {
      id: true,
      email: true,
      tipo: true,
      activo: true,
      fechaCreacion: true,
    },
  });
}

export function remove(id: number) {
  return prisma.usuario.delete({
    where: { id },
  });
}
