import type { PrismaClient } from '../../src/generated/prisma/client';

/**
 * Gestoría de demostración: lo que vería un directivo. Sin archivos, porque
 * esos viven en Storage y el seed no lo toca. Se identifican por el título:
 * correr el seed dos veces no las duplica.
 */
const gestiones = [
  {
    titulo: 'Renovación de la habilitación municipal',
    categoria: 'Trámites municipales',
    descripcion:
      'Contenido de ejemplo para la demostración.\n\n' +
      'Acá la administración deja los pasos del trámite, los documentos que hay que presentar y a quién dirigirse, para que cualquier directivo lo pueda consultar.',
  },
  {
    titulo: 'Certificado de origen',
    categoria: 'Comercio exterior',
    descripcion:
      'Contenido de ejemplo para la demostración.\n\n' +
      'Una gestión puede llevar adjuntos los formularios del trámite (PDF, Word o Excel) y fotos o escaneos de la documentación.',
  },
  {
    titulo: 'Resumen de la reunión de directiva',
    categoria: 'Informes de la directiva',
    descripcion:
      'Contenido de ejemplo para la demostración.\n\n' +
      'También sirve para dejar constancia de reuniones y acuerdos, con el acta adjunta.',
  },
];

export async function seedGestiones(prisma: PrismaClient, adminId: number) {
  let creadas = 0;

  for (const gestion of gestiones) {
    const existente = await prisma.gestion.findFirst({
      where: { titulo: gestion.titulo },
      select: { id: true },
    });

    if (existente) continue;

    await prisma.gestion.create({ data: { ...gestion, creadoPorId: adminId } });
    creadas++;
  }

  console.log(
    `Seed de Gestoría: ${creadas} creadas, ${gestiones.length - creadas} ya estaban.`,
  );
}
