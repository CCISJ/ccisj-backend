import { prisma } from '@/config/prisma';
import { Prisma } from '@/generated/prisma/client';
import { TipoUsuario } from '@/types/user.type';

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
      socio: {
        select: {
          tipo: true,
        },
      },
    },
  });
}

export function findByIdWithProfile(id: number) {
  return prisma.usuario.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      tipo: true,
      activo: true,

      socio: {
        select: {
          razonSocial: true,
          tipo: true,
        },
      },

      postulante: {
        select: {
          nombre: true,
          apellido: true,
        },
      },
    },
  });
}

// Lo que el middleware de sesión necesita saber del usuario en cada request:
// si sigue activo, su rol actual y a qué perfil pertenece.
export function findSessionUser(id: number) {
  return prisma.usuario.findUnique({
    where: { id },
    select: {
      id: true,
      tipo: true,
      activo: true,
      passwordActualizada: true,
      socio: {
        select: {
          id: true,
          tipo: true,
        },
      },
      postulante: {
        select: {
          id: true,
        },
      },
    },
  });
}

/** El hash de la contraseña, solo para verificarla antes de cambiarla. */
export function findPasswordHash(id: number) {
  return prisma.usuario.findUnique({
    where: { id },
    select: { password: true },
  });
}

export function updatePassword(id: number, hash: string, changedAt: Date) {
  return prisma.usuario.update({
    where: { id },
    data: {
      password: hash,
      passwordActualizada: changedAt,
    },
    select: { id: true },
  });
}

// Sin distinguir mayúsculas, para el login y para detectar emails repetidos.
// Los emails nuevos se guardan en minúsculas (ver `normalizeEmail`).
export function findByEmail(email: string) {
  return prisma.usuario.findFirst({
    where: {
      email: {
        equals: email,
        mode: 'insensitive',
      },
    },
  });
}

/** Si la cuenta es de un socio o de un postulante. */
export function findProfiles(id: number) {
  return prisma.usuario.findUnique({
    where: { id },
    select: {
      tipo: true,
      socio: { select: { id: true } },
      postulante: { select: { id: true } },
    },
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

export function findByIdWithApplicant(id: number) {
  return prisma.usuario.findUnique({
    where: { id },
    include: {
      postulante: true,
    },
  });
}

export async function findActiveUsers() {
  return prisma.usuario.findMany({
    where: {
      activo: true,
    },
    select: {
      id: true,
    },
  });
}

export async function findActiveUsersByType(tipo: TipoUsuario) {
  return prisma.usuario.findMany({
    where: {
      activo: true,
      tipo,
    },
    select: {
      id: true,
    },
  });
}

export async function findUsersByIds(usuarioIds: number[]) {
  return prisma.usuario.findMany({
    where: {
      id: {
        in: usuarioIds,
      },
      activo: true,
    },
    select: {
      id: true,
    },
  });
}

export async function findNotificationRecipients() {
  return prisma.usuario.findMany({
    where: {
      activo: true,
      tipo: {
        in: ['SOCIO', 'POSTULANTE'],
      },
    },
    select: {
      id: true,
      email: true,
      tipo: true,
      socio: {
        select: {
          razonSocial: true,
        },
      },
      postulante: {
        select: {
          nombre: true,
          apellido: true,
        },
      },
    },
    orderBy: {
      email: 'asc',
    },
  });
}

export function create(data: {
  email: string;
  password: string;
  tipo: 'ADMIN' | 'POSTULANTE' | 'SOCIO';
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
    tipo?: 'ADMIN' | 'POSTULANTE' | 'SOCIO';
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

/**
 * Borra la cuenta si no tiene historial: una empresa, ofertas publicadas o
 * notificaciones enviadas la frenan (restricción de la base). Devuelve false
 * en ese caso. Un postulante se borra con su perfil, CV y postulaciones.
 */
export async function remove(id: number) {
  try {
    await prisma.usuario.delete({
      where: { id },
    });

    return true;
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2003'
    ) {
      return false;
    }

    throw error;
  }
}
