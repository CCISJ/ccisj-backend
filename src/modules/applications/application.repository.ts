import { prisma } from '@/config/prisma';
import { cvSelect } from '@/modules/applicants/cv.repository';
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
// CV del postulante (el formulario y los PDF), sin el resto de su cuenta. Los
// PDF van sin su ruta interna: se abren con un enlace firmado
// (`GET /postulaciones/recibidas/:id/cv/:cvId`).
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
    select: cvSelect,
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

// Lo que ve el postulante de sus propias postulaciones: la oferta y la empresa
// que la publicó, sin datos internos de la oferta ni de su cuenta.
const ownApplicationSelect = {
  id: true,
  fechaPostulacion: true,
  estado: true,
  observaciones: true,
  oferta: {
    select: {
      id: true,
      titulo: true,
      estado: true,
      ubicacion: true,
      modalidad: true,
      fechaCierre: true,
      socio: {
        select: {
          razonSocial: true,
        },
      },
    },
  },
} as const;

/** El PDF de un CV, si es del postulante de una postulación del socio. */
export function findReceivedCvFile(
  applicationId: number,
  socioId: number,
  cvId: number,
) {
  return prisma.cv.findFirst({
    where: {
      id: cvId,
      postulante: {
        postulaciones: {
          some: { id: applicationId, oferta: { socioId } },
        },
      },
    },
    select: { archivoUrl: true },
  });
}

export function findByApplicant(postulanteId: number) {
  return prisma.postulacion.findMany({
    where: { postulanteId },
    select: ownApplicationSelect,
    orderBy: [{ fechaPostulacion: 'desc' }, { id: 'desc' }],
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
