import { prisma } from '@/config/prisma';
import { escapeLike } from '@/utils/like';

/** Lo que se muestra de un archivo: nunca su ruta en Storage. */
const ARCHIVO_PUBLICO = {
  id: true,
  nombre: true,
  tipo: true,
  tamano: true,
  fechaSubida: true,
} as const;

export type GestionFilters = {
  search?: string;
  categoria?: string;
};

export function findAll({ search, categoria }: GestionFilters) {
  const texto = search ? escapeLike(search) : undefined;

  return prisma.gestion.findMany({
    where: {
      ...(categoria
        ? { categoria: { equals: escapeLike(categoria), mode: 'insensitive' } }
        : {}),
      ...(texto
        ? {
            OR: [
              { titulo: { contains: texto, mode: 'insensitive' } },
              { descripcion: { contains: texto, mode: 'insensitive' } },
              { categoria: { contains: texto, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    select: {
      id: true,
      titulo: true,
      descripcion: true,
      categoria: true,
      fechaCreacion: true,
      fechaActualizacion: true,
      _count: { select: { archivos: true } },
    },
    orderBy: [{ fechaActualizacion: 'desc' }, { id: 'desc' }],
  });
}

export function findById(id: number) {
  return prisma.gestion.findUnique({
    where: { id },
    select: {
      id: true,
      titulo: true,
      descripcion: true,
      categoria: true,
      fechaCreacion: true,
      fechaActualizacion: true,
      archivos: {
        select: ARCHIVO_PUBLICO,
        orderBy: [{ fechaSubida: 'asc' }, { id: 'asc' }],
      },
    },
  });
}

export function exists(id: number) {
  return prisma.gestion.findUnique({ where: { id }, select: { id: true } });
}

/** Las categorías en uso, con cuántas gestiones tiene cada una. */
export async function findCategories() {
  const groups = await prisma.gestion.groupBy({
    by: ['categoria'],
    _count: { _all: true },
    orderBy: { categoria: 'asc' },
  });

  return groups.map((group) => ({
    nombre: group.categoria,
    cantidad: group._count._all,
  }));
}

/** Una categoría que ya existe escrita igual salvo mayúsculas. */
export async function findCategoryLike(categoria: string) {
  const found = await prisma.gestion.findFirst({
    where: {
      categoria: { equals: escapeLike(categoria), mode: 'insensitive' },
    },
    select: { categoria: true },
  });

  return found?.categoria ?? null;
}

export function create(data: {
  titulo: string;
  descripcion: string;
  categoria: string;
  creadoPorId: number;
}) {
  return prisma.gestion.create({ data, select: { id: true } });
}

export function update(
  id: number,
  data: Partial<{ titulo: string; descripcion: string; categoria: string }>,
) {
  return prisma.gestion.update({ where: { id }, data, select: { id: true } });
}

/** Marca la gestión como actualizada: cambió algo de sus archivos. */
export function touch(id: number) {
  return prisma.gestion.update({
    where: { id },
    data: { fechaActualizacion: new Date() },
    select: { id: true },
  });
}

export function remove(id: number) {
  return prisma.gestion.delete({ where: { id } });
}

export function findFilePaths(gestionId: number) {
  return prisma.archivoGestion.findMany({
    where: { gestionId },
    select: { ruta: true },
  });
}

export function countFiles(gestionId: number) {
  return prisma.archivoGestion.count({ where: { gestionId } });
}

export function createFiles(
  gestionId: number,
  files: { ruta: string; nombre: string; tipo: string; tamano: number }[],
) {
  return prisma.$transaction(
    files.map((file) =>
      prisma.archivoGestion.create({
        data: { ...file, gestionId },
        select: ARCHIVO_PUBLICO,
      }),
    ),
  );
}

export function findFile(gestionId: number, archivoId: number) {
  return prisma.archivoGestion.findFirst({
    where: { id: archivoId, gestionId },
    select: { id: true, ruta: true, nombre: true, tipo: true },
  });
}

export function removeFile(archivoId: number) {
  return prisma.archivoGestion.delete({ where: { id: archivoId } });
}
