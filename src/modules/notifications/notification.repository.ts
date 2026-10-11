import { prisma } from '@/config/prisma';
import { Prisma } from '@/generated/prisma/client';
import type { TipoNotificacion } from '@/types/notification.type';

type CreateNotificationData = {
  titulo: string;
  mensaje: string;
  tipo: TipoNotificacion;
  creadoPorId: number;
  usuarioIds: number[];
};

export async function create(data: CreateNotificationData) {
  return prisma.$transaction(async (tx) => {
    const notification = await tx.notificacion.create({
      data: {
        titulo: data.titulo,
        mensaje: data.mensaje,
        tipo: data.tipo,
        creadoPorId: data.creadoPorId,
      },
    });

    if (data.usuarioIds.length > 0) {
      // Los destinatarios los eligió el service con una consulta anterior, y
      // entre esa consulta y este insert alguno puede haberse borrado: la
      // clave foránea fallaba y la notificación no se creaba para nadie.
      // Se vuelven a leer acá con FOR KEY SHARE: los que ya no existen quedan
      // afuera, y un borrado que esté en curso espera a que esta transacción
      // termine (y al confirmarse se lleva sus filas por el `onDelete:
      // Cascade`).
      const usuarios = await tx.$queryRaw<{ id: number }[]>`
        SELECT id FROM usuario
        WHERE id IN (${Prisma.join(data.usuarioIds)})
        FOR KEY SHARE
      `;

      await tx.notificacionUsuario.createMany({
        data: usuarios.map(({ id: usuarioId }) => ({
          notificacionId: notification.id,
          usuarioId,
        })),
        skipDuplicates: true,
      });
    }

    return tx.notificacion.findUnique({
      where: {
        id: notification.id,
      },
      include: {
        creadoPor: {
          select: {
            id: true,
            email: true,
            tipo: true,
          },
        },
        destinatarios: {
          include: {
            usuario: {
              select: {
                id: true,
                email: true,
                tipo: true,
              },
            },
          },
        },
      },
    });
  });
}

// Lo que envió la administración. Los avisos automáticos (por ejemplo, el de
// una empresa que cambia el estado de una postulación) le llegan a su
// destinatario pero no se listan acá.
export async function findAll() {
  return prisma.notificacion.findMany({
    where: {
      creadoPor: { tipo: 'ADMIN' },
    },
    orderBy: {
      fechaCreacion: 'desc',
    },
    include: {
      creadoPor: {
        select: {
          id: true,
          email: true,
          tipo: true,
        },
      },
      destinatarios: {
        include: {
          usuario: {
            select: {
              id: true,
              email: true,
              tipo: true,
            },
          },
        },
      },
    },
  });
}

export async function findByUserId(usuarioId: number) {
  return prisma.notificacionUsuario.findMany({
    where: {
      usuarioId,
    },
    orderBy: {
      notificacion: {
        fechaCreacion: 'desc',
      },
    },
    include: {
      notificacion: {
        // Quien recibe un aviso solo necesita saber si vino de la
        // administración o de una empresa: ni el email de acceso ni el ID de
        // la cuenta que lo creó.
        omit: { creadoPorId: true },
        include: {
          creadoPor: {
            select: {
              tipo: true,
            },
          },
        },
      },
    },
  });
}

export async function findPendingPopups(usuarioId: number) {
  return prisma.notificacionUsuario.findMany({
    where: {
      usuarioId,
      emergenteVista: false,
      notificacion: {
        tipo: 'EMERGENTE',
      },
    },
    orderBy: {
      notificacion: {
        fechaCreacion: 'asc',
      },
    },
    include: {
      notificacion: {
        omit: { creadoPorId: true },
      },
    },
  });
}

/**
 * Marca una notificación del usuario. Devuelve null si no la recibió: así una
 * ajena o inexistente es un 404 y no un error de la base.
 */
async function markOwn(
  usuarioId: number,
  notificacionId: number,
  data: {
    leida?: boolean;
    fechaLectura?: Date;
    emergenteVista?: boolean;
    fechaEmergenteVista?: Date;
  },
) {
  const { count } = await prisma.notificacionUsuario.updateMany({
    where: { notificacionId, usuarioId },
    data,
  });

  if (count === 0) return null;

  return prisma.notificacionUsuario.findUnique({
    where: {
      notificacionId_usuarioId: {
        notificacionId,
        usuarioId,
      },
    },
  });
}

export function markAsRead(usuarioId: number, notificacionId: number) {
  return markOwn(usuarioId, notificacionId, {
    leida: true,
    fechaLectura: new Date(),
  });
}

export function markPopupAsSeen(usuarioId: number, notificacionId: number) {
  return markOwn(usuarioId, notificacionId, {
    emergenteVista: true,
    fechaEmergenteVista: new Date(),
  });
}
