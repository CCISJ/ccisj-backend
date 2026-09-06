import { prisma } from '@/config/prisma';

const applicationInclude = {
  oferta: {
    select: {
      id: true,
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
      cv: true,
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
