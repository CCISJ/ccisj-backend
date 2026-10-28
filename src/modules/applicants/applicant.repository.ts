import { prisma } from '@/config/prisma';
import type { Prisma } from '@/generated/prisma/client';
import { CandidateSearchFilters } from '@/types/application.type';
import { escapeLike } from '@/utils/like';

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
      // Para saber si completó el CV en el formulario (ver postularse).
      _count: {
        select: {
          estudios: true,
          experiencias: true,
        },
      },
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
  telefono: string;
  categoriaIds: number[];
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
        categorias: {
          create: data.categoriaIds.map((categoriaId) => ({ categoriaId })),
        },
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

export async function searchCandidates(filters: CandidateSearchFilters) {
  const { search, categoriaId, conEstudios, conExperiencia, page, limit } =
    filters;

  // Prisma arma `contains` con ILIKE sin escapar: sin esto, buscar `%` o `_`
  // devolvía a todos (ver utils/like.ts).
  const text = search ? escapeLike(search) : undefined;

  const where: Prisma.PostulanteWhereInput = {
    usuario: {
      activo: true,
    },

    ...(text && {
      OR: [
        { nombre: { contains: text, mode: 'insensitive' as const } },
        { apellido: { contains: text, mode: 'insensitive' as const } },
      ],
    }),

    ...(categoriaId && {
      categorias: {
        some: { categoriaId },
      },
    }),

    ...(conEstudios && {
      estudios: { some: {} },
    }),

    ...(conExperiencia && {
      experiencias: { some: {} },
    }),
  };

  const [items, total] = await prisma.$transaction([
    prisma.postulante.findMany({
      where,
      select: {
        id: true,
        nombre: true,
        apellido: true,
        direccion: true,
        categorias: {
          select: {
            categoria: {
              select: {
                id: true,
                nombre: true,
              },
            },
          },
        },
        estudios: {
          select: {
            titulo: true,
            institucion: true,
          },
          orderBy: { orden: 'asc' },
          take: 2,
        },
        experiencias: {
          select: {
            cargo: true,
            empresa: true,
          },
          orderBy: { orden: 'asc' },
          take: 2,
        },
        _count: {
          select: {
            estudios: true,
            experiencias: true,
            cvs: true,
          },
        },
      },
      orderBy: [{ apellido: 'asc' }, { nombre: 'asc' }, { id: 'asc' }],
      skip: (page - 1) * limit,
      take: limit,
    }),

    prisma.postulante.count({ where }),
  ]);

  return {
    items,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

export function findCandidateById(id: number) {
  return prisma.postulante.findFirst({
    where: {
      id,
      usuario: { activo: true },
    },
    select: {
      id: true,
      nombre: true,
      apellido: true,
      direccion: true,
      otros: true,
      estudios: {
        orderBy: [{ orden: 'asc' }, { id: 'asc' }],
      },
      experiencias: {
        orderBy: [{ orden: 'asc' }, { id: 'asc' }],
      },
      referencias: {
        orderBy: [{ orden: 'asc' }, { id: 'asc' }],
      },
      categorias: {
        select: {
          categoria: {
            select: {
              id: true,
              nombre: true,
            },
          },
        },
      },
      cvs: {
        select: {
          id: true,
          nombreArchivo: true,
          descripcion: true,
          fechaActualizacion: true,
        },
      },
    },
  });
}

export function findCandidateCvFile(candidateId: number, cvId: number) {
  return prisma.cv.findFirst({
    where: {
      id: cvId,
      postulanteId: candidateId,
      postulante: {
        usuario: { activo: true },
      },
    },
    select: {
      archivoUrl: true,
    },
  });
}
