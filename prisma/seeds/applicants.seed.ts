import type { PrismaClient } from '../../src/generated/prisma/client';

export async function seedApplicants(
  prisma: PrismaClient,
  usuarioPostulanteId: number,
) {
  const postulante = await prisma.postulante.upsert({
    where: {
      usuarioId: usuarioPostulanteId,
    },
    update: {
      nombre: 'Juan',
      apellido: 'Pérez',
      telefono: '098123456',
    },
    create: {
      usuarioId: usuarioPostulanteId,
      nombre: 'Juan',
      apellido: 'Pérez',
      telefono: '098123456',
    },
  });

  // =========================
  // CV
  // =========================

  // El CV del formulario ("Mi CV"). No se siembran PDF: viven en Supabase
  // Storage y una ruta inventada daría un enlace roto. Las listas se
  // reemplazan, así el seed se puede correr varias veces.

  await prisma.postulante.update({
    where: { id: postulante.id },
    data: {
      direccion: '18 de Julio 456, San José de Mayo',
      fechaNacimiento: new Date('1998-04-12'),
      otros:
        'Libreta de conducir categoría A. Disponibilidad horaria completa.',
    },
  });

  await prisma.estudio.deleteMany({ where: { postulanteId: postulante.id } });
  await prisma.experienciaLaboral.deleteMany({
    where: { postulanteId: postulante.id },
  });
  await prisma.referencia.deleteMany({
    where: { postulanteId: postulante.id },
  });

  await prisma.estudio.createMany({
    data: [
      {
        postulanteId: postulante.id,
        tipo: 'CURRICULAR',
        institucion: 'Liceo N°1 de San José',
        titulo: 'Bachillerato completo',
        fechaInicio: new Date('2011-03-01'),
        fechaFin: new Date('2016-12-01'),
        orden: 0,
      },
      {
        postulanteId: postulante.id,
        tipo: 'NO_CURRICULAR',
        institucion: 'INEFOP',
        titulo: 'Curso de atención al cliente',
        fechaInicio: new Date('2019-05-01'),
        fechaFin: new Date('2019-08-01'),
        orden: 1,
      },
    ],
  });

  await prisma.experienciaLaboral.create({
    data: {
      postulanteId: postulante.id,
      empresa: 'Supermercado El Centro',
      cargo: 'Cajero',
      fechaInicio: new Date('2020-02-01'),
      fechaFin: new Date('2023-06-01'),
      tareas: 'Atención en caja, reposición y cierre de caja diario.',
    },
  });

  await prisma.referencia.createMany({
    data: [
      {
        postulanteId: postulante.id,
        tipo: 'LABORAL',
        nombre: 'Laura Martínez',
        relacion: 'Encargada, Supermercado El Centro',
        telefono: '099555666',
        orden: 0,
      },
      {
        postulanteId: postulante.id,
        tipo: 'PERSONAL',
        nombre: 'Carlos Rodríguez',
        relacion: 'Vecino',
        telefono: '098777888',
        orden: 1,
      },
    ],
  });
  return { postulante };
}
