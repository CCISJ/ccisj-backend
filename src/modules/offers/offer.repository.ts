import { prisma } from '@/config/prisma';
import type { OfferModality, OfferStatus } from '@/types/offer.type';

type CreateOfferData = {
  socioId: number;
  creadaPor: number;
  titulo: string;
  descripcion: string;
  ubicacion: string | null;
  modalidad: OfferModality | null;
  cantidadVacantes: number;
  fechaCierre: Date | null;
  categoriaIds: number[];
};

export type UpdateOfferData = {
  titulo?: string;
  descripcion?: string;
  ubicacion?: string | null;
  modalidad?: OfferModality | null;
  cantidadVacantes?: number;
  fechaCierre?: Date | null;
  estado?: OfferStatus;
  categoriaIds?: number[];
};

// Las ofertas las ven todos los usuarios, postulantes incluidos: de la empresa
// va solo lo público. Antes viajaba el socio entero (RUT, BPS, observaciones)
// y el email de la cuenta que la creó.
const offerInclude = {
  socio: {
    select: {
      id: true,
      razonSocial: true,
      giroComercial: true,
      ciudad: true,
    },
  },

  creador: {
    select: {
      id: true,
      tipo: true,
    },
  },

  categorias: {
    include: {
      categoria: true,
    },
  },
} as const;

// Para el propio socio: sus ofertas con la cantidad de postulaciones. El
// conteo no va en offerInclude porque no es algo que deban ver los demás.
const ownOfferInclude = {
  categorias: {
    include: {
      categoria: true,
    },
  },

  _count: {
    select: {
      postulaciones: true,
    },
  },
} as const;

export function closeExpired(now: Date) {
  return prisma.oferta.updateMany({
    where: {
      estado: 'ACTIVA',
      fechaCierre: { lt: now },
    },
    data: {
      estado: 'CERRADA',
    },
  });
}

export function findAll() {
  return prisma.oferta.findMany({
    include: offerInclude,
    orderBy: {
      fechaPublicacion: 'desc',
    },
  });
}

export function findById(id: number) {
  return prisma.oferta.findUnique({
    where: { id },
    include: offerInclude,
  });
}

export function findBySocio(socioId: number) {
  return prisma.oferta.findMany({
    where: { socioId },
    include: ownOfferInclude,
    orderBy: {
      fechaPublicacion: 'desc',
    },
  });
}

export function findOwnById(id: number, socioId: number) {
  return prisma.oferta.findFirst({
    where: { id, socioId },
    include: ownOfferInclude,
  });
}

export function create(data: CreateOfferData) {
  const { categoriaIds, ...offerData } = data;

  return prisma.oferta.create({
    data: {
      ...offerData,

      categorias: {
        create: categoriaIds.map((categoriaId) => ({
          categoria: {
            connect: {
              id: categoriaId,
            },
          },
        })),
      },
    },

    include: offerInclude,
  });
}

export async function update(id: number, data: UpdateOfferData) {
  const { categoriaIds, ...offerData } = data;

  return prisma.$transaction(async (tx) => {
    if (categoriaIds) {
      await tx.ofertaCategoria.deleteMany({
        where: {
          ofertaId: id,
        },
      });
    }

    return tx.oferta.update({
      where: { id },

      data: {
        ...offerData,

        ...(categoriaIds && {
          categorias: {
            create: categoriaIds.map((categoriaId) => ({
              categoria: {
                connect: {
                  id: categoriaId,
                },
              },
            })),
          },
        }),
      },

      include: offerInclude,
    });
  });
}

/**
 * Borra la oferta solo si no tiene postulaciones. La fila se bloquea antes de
 * contar: una postulación que entra en ese momento necesita la oferta para su
 * clave foránea, así que espera a que termine el borrado (y falla) o, si llegó
 * antes, ya aparece en el conteo. Contar y borrar por separado dejaba una
 * ventana en la que la cascada se llevaba una postulación recién creada.
 */
export function removeIfNoApplications(id: number) {
  return prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<{ id: number }[]>`
      SELECT id FROM oferta WHERE id = ${id} FOR UPDATE
    `;

    if (locked.length === 0) {
      return 'not-found' as const;
    }

    const applications = await tx.postulacion.count({
      where: { ofertaId: id },
    });

    if (applications > 0) {
      return 'has-applications' as const;
    }

    await tx.oferta.delete({
      where: { id },
    });

    return 'deleted' as const;
  });
}
