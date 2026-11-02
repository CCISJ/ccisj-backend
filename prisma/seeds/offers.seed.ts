import type { PrismaClient } from '../../src/generated/prisma/client';

export async function seedOffers(
  prisma: PrismaClient,
  socioId: number,
  usuarioSocioId: number,
  postulanteId: number,
  administracionId: number,
  contabilidadId: number,
  tecnologiaId: number,
  ventasId: number,
) {
  let oferta = await prisma.oferta.findFirst({
    where: {
      titulo: 'Auxiliar administrativo',
      socioId: socioId,
    },
  });

  if (!oferta) {
    oferta = await prisma.oferta.create({
      data: {
        socioId: socioId,
        creadaPor: usuarioSocioId,
        titulo: 'Auxiliar administrativo',
        descripcion:
          'Se busca auxiliar administrativo para tareas generales de oficina.',
        ubicacion: 'San José de Mayo',
        modalidad: 'PRESENCIAL',
        cantidadVacantes: 2,
      },
    });
  }

  // =========================
  // CATEGORÍAS DE LA OFERTA
  // =========================

  await Promise.all([
    prisma.ofertaCategoria.upsert({
      where: {
        ofertaId_categoriaId: {
          ofertaId: oferta.id,
          categoriaId: administracionId,
        },
      },
      update: {},
      create: {
        ofertaId: oferta.id,
        categoriaId: administracionId,
      },
    }),

    prisma.ofertaCategoria.upsert({
      where: {
        ofertaId_categoriaId: {
          ofertaId: oferta.id,
          categoriaId: contabilidadId,
        },
      },
      update: {},
      create: {
        ofertaId: oferta.id,
        categoriaId: contabilidadId,
      },
    }),
  ]);

  // =========================
  // MÁS OFERTAS (para ver el filtro por rubro)
  // =========================

  const masOfertas = [
    {
      titulo: 'Técnico de soporte informático',
      descripcion:
        'Se busca técnico para soporte a usuarios, mantenimiento de equipos y redes en la empresa.',
      modalidad: 'PRESENCIAL',
      cantidadVacantes: 1,
      categoriaId: tecnologiaId,
    },
    {
      titulo: 'Desarrollador web',
      descripcion:
        'Desarrollo y mantenimiento de sitios y sistemas web. Se valora experiencia con JavaScript y bases de datos.',
      modalidad: 'HIBRIDO',
      cantidadVacantes: 1,
      categoriaId: tecnologiaId,
    },
    {
      titulo: 'Vendedor de mostrador',
      descripcion:
        'Atención al público, asesoramiento a clientes y manejo de caja.',
      modalidad: 'PRESENCIAL',
      cantidadVacantes: 2,
      categoriaId: ventasId,
    },
  ];

  for (const { categoriaId, ...datos } of masOfertas) {
    const existente = await prisma.oferta.findFirst({
      where: { titulo: datos.titulo, socioId: socioId },
    });

    if (existente) continue;

    await prisma.oferta.create({
      data: {
        ...datos,
        socioId: socioId,
        creadaPor: usuarioSocioId,
        ubicacion: 'San José de Mayo',
        categorias: { create: { categoriaId } },
      },
    });
  }

  // =========================
  // POSTULACIÓN
  // =========================

  await prisma.postulacion.upsert({
    where: {
      ofertaId_postulanteId: {
        ofertaId: oferta.id,
        postulanteId: postulanteId,
      },
    },
    update: {},
    create: {
      ofertaId: oferta.id,
      postulanteId: postulanteId,
      estado: 'ENVIADA',
      observaciones: 'Postulación de prueba',
    },
  });
}
