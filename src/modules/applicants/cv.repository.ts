import { prisma } from '@/config/prisma';

export type EducationInput = {
  tipo: 'CURRICULAR' | 'NO_CURRICULAR';
  institucion: string;
  titulo: string;
  fechaInicio: Date | null;
  fechaFin: Date | null;
  enCurso: boolean;
  descripcion: string | null;
};

export type ExperienceInput = {
  empresa: string;
  cargo: string;
  fechaInicio: Date | null;
  fechaFin: Date | null;
  actual: boolean;
  tareas: string | null;
};

export type ReferenceInput = {
  tipo: 'LABORAL' | 'PERSONAL';
  nombre: string;
  relacion: string | null;
  telefono: string | null;
  email: string | null;
};

export type CvInput = {
  nombre: string;
  apellido: string;
  telefono: string | null;
  direccion: string | null;
  fechaNacimiento: Date | null;
  otros: string | null;
  estudios: EducationInput[];
  experiencias: ExperienceInput[];
  referencias: ReferenceInput[];
  // undefined = no se cambian.
  categoriaIds?: number[];
};

export const fileSelect = {
  id: true,
  nombreArchivo: true,
  descripcion: true,
  fechaActualizacion: true,
} as const;

/**
 * Todo el CV de un postulante. Lo usa el propio postulante y, de solo
 * lectura, la empresa que recibió su postulación: por eso no lleva datos de
 * la cuenta salvo el email, ni la ruta interna de los archivos.
 */
export const cvDataSelect = {
  id: true,
  nombre: true,
  apellido: true,
  telefono: true,
  direccion: true,
  fechaNacimiento: true,
  otros: true,
  usuario: { select: { email: true } },
  estudios: {
    orderBy: { orden: 'asc' },
    select: {
      id: true,
      tipo: true,
      institucion: true,
      titulo: true,
      fechaInicio: true,
      fechaFin: true,
      enCurso: true,
      descripcion: true,
    },
  },
  experiencias: {
    orderBy: { orden: 'asc' },
    select: {
      id: true,
      empresa: true,
      cargo: true,
      fechaInicio: true,
      fechaFin: true,
      actual: true,
      tareas: true,
    },
  },
  referencias: {
    orderBy: { orden: 'asc' },
    select: {
      id: true,
      tipo: true,
      nombre: true,
      relacion: true,
      telefono: true,
      email: true,
    },
  },
  categorias: {
    select: { categoria: { select: { id: true, nombre: true } } },
  },
} as const;

/** El CV completo del postulante, con todos sus PDF. */
export const cvSelect = {
  ...cvDataSelect,
  cvs: {
    select: fileSelect,
    orderBy: { fechaActualizacion: 'desc' },
  },
} as const;

export function findCv(postulanteId: number) {
  return prisma.postulante.findUnique({
    where: { id: postulanteId },
    select: cvSelect,
  });
}

/**
 * Guarda el CV entero: los datos personales y las tres listas. Las listas se
 * reemplazan completas (el formulario siempre manda todo), en una sola
 * transacción para que nunca quede un CV a medio guardar.
 */
export function saveCv(postulanteId: number, data: CvInput) {
  const withOrder = <T>(items: T[]) =>
    items.map((item, orden) => ({ ...item, postulanteId, orden }));

  return prisma.$transaction(async (tx) => {
    await tx.postulante.update({
      where: { id: postulanteId },
      data: {
        nombre: data.nombre,
        apellido: data.apellido,
        telefono: data.telefono,
        direccion: data.direccion,
        fechaNacimiento: data.fechaNacimiento,
        otros: data.otros,
      },
    });

    if (data.categoriaIds) {
      await tx.postulanteCategoria.deleteMany({ where: { postulanteId } });

      if (data.categoriaIds.length > 0) {
        await tx.postulanteCategoria.createMany({
          data: data.categoriaIds.map((categoriaId) => ({
            postulanteId,
            categoriaId,
          })),
        });
      }
    }

    await tx.estudio.deleteMany({ where: { postulanteId } });
    await tx.experienciaLaboral.deleteMany({ where: { postulanteId } });
    await tx.referencia.deleteMany({ where: { postulanteId } });

    if (data.estudios.length > 0) {
      await tx.estudio.createMany({ data: withOrder(data.estudios) });
    }

    if (data.experiencias.length > 0) {
      await tx.experienciaLaboral.createMany({
        data: withOrder(data.experiencias),
      });
    }

    if (data.referencias.length > 0) {
      await tx.referencia.createMany({ data: withOrder(data.referencias) });
    }

    return tx.postulante.findUniqueOrThrow({
      where: { id: postulanteId },
      select: cvSelect,
    });
  });
}

export type ProfileInput = {
  nombre: string;
  apellido: string;
  telefono: string;
  direccion: string | null;
  fechaNacimiento: Date | null;
  categoriaIds: number[];
};

/** "Mi perfil": datos personales y rubros de interés, sin tocar el resto. */
export function saveProfile(postulanteId: number, data: ProfileInput) {
  const { categoriaIds, ...personal } = data;

  return prisma.$transaction(async (tx) => {
    await tx.postulante.update({ where: { id: postulanteId }, data: personal });

    await tx.postulanteCategoria.deleteMany({ where: { postulanteId } });

    if (categoriaIds.length > 0) {
      await tx.postulanteCategoria.createMany({
        data: categoriaIds.map((categoriaId) => ({
          postulanteId,
          categoriaId,
        })),
      });
    }

    return tx.postulante.findUniqueOrThrow({
      where: { id: postulanteId },
      select: cvSelect,
    });
  });
}

export function countFiles(postulanteId: number) {
  return prisma.cv.count({ where: { postulanteId } });
}

export function createFiles(
  postulanteId: number,
  files: { archivoUrl: string; nombreArchivo: string }[],
) {
  return prisma.cv.createManyAndReturn({
    data: files.map((file) => ({ ...file, postulanteId })),
    select: fileSelect,
  });
}

export function findFile(id: number) {
  return prisma.cv.findUnique({
    where: { id },
    select: { id: true, postulanteId: true, archivoUrl: true },
  });
}

export function deleteFile(id: number) {
  return prisma.cv.delete({ where: { id } });
}
