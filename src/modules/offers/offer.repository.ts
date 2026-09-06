import { prisma } from '@/config/prisma';

type CreateOfferData = {
  socioId: number;
  creadaPor: number;
  titulo: string;
  descripcion: string;
  ubicacion?: string;
  modalidad?: string;
  cantidadVacantes?: number;
  fechaCierre?: Date;
  categoriaIds: number[];
};

type UpdateOfferData = {
  titulo?: string;
  descripcion?: string;
  ubicacion?: string;
  modalidad?: string;
  cantidadVacantes?: number;
  fechaCierre?: Date | null;
  estado?: 'ACTIVA' | 'CERRADA';
  categoriaIds?: number[];
};

const offerInclude = {
  socio: true,

  creador: {
    select: {
      id: true,
      email: true,
      tipo: true,
    },
  },

  categorias: {
    include: {
      categoria: true,
    },
  },
} as const;

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

export function remove(id: number) {
  return prisma.oferta.delete({
    where: { id },
  });
}
