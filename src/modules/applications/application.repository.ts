import { prisma } from '@/config/prisma';
import type { ApplicationStatus } from '@/types/application.type';

const applicationInclude = {
  oferta: {
    select: {
      id: true,
      socioId: true,
      titulo: true,
      estado: true,
    },
  },
  postulante: {
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
  },
} as const;

export function findAll() {
  return prisma.postulacion.findMany({
    include: applicationInclude,
    orderBy: {
      fechaPostulacion: 'desc',
    },
  });
}

export function findById(id: number) {
  return prisma.postulacion.findUnique({
    where: { id },
    include: applicationInclude,
  });
}

export function findByOfferAndApplicant(
  ofertaId: number,
  postulanteId: number,
) {
  return prisma.postulacion.findUnique({
    where: {
      ofertaId_postulanteId: {
        ofertaId,
        postulanteId,
      },
    },
  });
}

export function create(data: {
  ofertaId: number;
  postulanteId: number;
  observaciones?: string;
}) {
  return prisma.postulacion.create({
    data,
    include: applicationInclude,
  });
}

export function update(
  id: number,
  data: {
    estado?:
      | 'ENVIADA'
      | 'EN_REVISION'
      | 'SELECCIONADO'
      | 'NO_SELECCIONADO'
      | 'FINALIZADA';
    observaciones?: string;
  },
) {
  return prisma.postulacion.update({
    where: { id },
    data,
    include: applicationInclude,
  });
}

export function remove(id: number) {
  return prisma.postulacion.delete({
    where: { id },
  });
}

// Lo que ve la empresa de cada postulación a sus ofertas: datos de contacto y
// CV del postulante, sin el resto de su cuenta.
const receivedApplicationSelect = {
  id: true,
  fechaPostulacion: true,
  estado: true,
  observaciones: true,
  oferta: {
    select: {
      id: true,
      titulo: true,
      estado: true,
    },
  },
  postulante: {
    select: {
      id: true,
      nombre: true,
      apellido: true,
      telefono: true,
      usuario: {
        select: {
          email: true,
        },
      },
      cvs: {
        select: {
          id: true,
          archivoUrl: true,
          descripcion: true,
          fechaActualizacion: true,
        },
        orderBy: {
          fechaActualizacion: 'desc',
        },
      },
    },
  },
} as const;

export function findReceivedBySocio(socioId: number) {
  return prisma.postulacion.findMany({
    where: {
      oferta: { socioId },
    },
    select: receivedApplicationSelect,
    orderBy: [{ fechaPostulacion: 'desc' }, { id: 'desc' }],
  });
}

export function findReceivedById(id: number, socioId: number) {
  return prisma.postulacion.findFirst({
    where: {
      id,
      oferta: { socioId },
    },
    select: receivedApplicationSelect,
  });
}

/** Lo necesario para cambiar el estado y avisarle al postulante. */
export function findForStatusChange(id: number) {
  return prisma.postulacion.findUnique({
    where: { id },
    select: {
      id: true,
      estado: true,
      oferta: {
        select: {
          socioId: true,
          titulo: true,
          socio: {
            select: {
              razonSocial: true,
            },
          },
        },
      },
      postulante: {
        select: {
          usuario: {
            select: {
              id: true,
              activo: true,
            },
          },
        },
      },
    },
  });
}

type StatusChange = {
  id: number;
  from: ApplicationStatus;
  to: ApplicationStatus;
  notification: {
    titulo: string;
    mensaje: string;
    creadoPorId: number;
    usuarioId: number;
  } | null;
};

/**
 * Cambia el estado y crea el aviso al postulante en la misma transacción: o
 * pasan las dos cosas o ninguna. El estado solo cambia si sigue siendo el que
 * se leyó (`from`); si otro cambio llegó antes, devuelve false y no avisa.
 */
export function changeStatus({ id, from, to, notification }: StatusChange) {
  return prisma.$transaction(async (tx) => {
    const { count } = await tx.postulacion.updateMany({
      where: { id, estado: from },
      data: { estado: to },
    });

    if (count === 0) return false;

    if (notification) {
      await tx.notificacion.create({
        data: {
          titulo: notification.titulo,
          mensaje: notification.mensaje,
          tipo: 'NORMAL',
          creadoPorId: notification.creadoPorId,
          destinatarios: {
            create: { usuarioId: notification.usuarioId },
          },
        },
      });
    }

    return true;
  });
}
