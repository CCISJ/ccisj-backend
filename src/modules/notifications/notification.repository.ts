import { prisma } from '@/config/prisma';

import type { TipoNotificacion } from '@/types/notification.type';
import type { TipoUsuario } from '@/types/user.type';

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
      await tx.notificacionUsuario.createMany({
        data: data.usuarioIds.map((usuarioId) => ({
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

export async function findAll() {
  return prisma.notificacion.findMany({
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
        include: {
          creadoPor: {
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
      notificacion: true,
    },
  });
}

export async function markAsRead(usuarioId: number, notificacionId: number) {
  return prisma.notificacionUsuario.update({
    where: {
      notificacionId_usuarioId: {
        notificacionId,
        usuarioId,
      },
    },
    data: {
      leida: true,
      fechaLectura: new Date(),
    },
  });
}

export async function markPopupAsSeen(
  usuarioId: number,
  notificacionId: number,
) {
  return prisma.notificacionUsuario.update({
    where: {
      notificacionId_usuarioId: {
        notificacionId,
        usuarioId,
      },
    },
    data: {
      emergenteVista: true,
      fechaEmergenteVista: new Date(),
    },
  });
}
