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
      cvs: true,
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
      cvs: true,
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

/**
 * Registro público: crea la cuenta (tipo POSTULANTE) y su perfil juntos. Si
 * falla el perfil no queda una cuenta suelta sin postulante.
 */
export function createWithAccount(data: {
  email: string;
  passwordHash: string;
  nombre: string;
  apellido: string;
  telefono?: string;
}) {
  return prisma.$transaction(async (tx) => {
    const usuario = await tx.usuario.create({
      data: {
        email: data.email,
        password: data.passwordHash,
        tipo: 'POSTULANTE',
      },
      select: {
        id: true,
        email: true,
        tipo: true,
      },
    });

    const postulante = await tx.postulante.create({
      data: {
        usuarioId: usuario.id,
        nombre: data.nombre,
        apellido: data.apellido,
        telefono: data.telefono,
      },
      select: {
        id: true,
      },
    });

    return { usuario, postulanteId: postulante.id };
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
      cvs: true,
    },
  });
}

export function remove(id: number) {
  return prisma.postulante.delete({
    where: { id },
  });
}
