import type { PrismaClient } from '../../src/generated/prisma/client';

export async function seedCategories(prisma: PrismaClient) {
  const administracion = await prisma.categoria.upsert({
    where: {
      nombre: 'Administración',
    },
    update: {},
    create: {
      nombre: 'Administración',
      descripcion: 'Puestos administrativos y de oficina',
    },
  });

  const contabilidad = await prisma.categoria.upsert({
    where: {
      nombre: 'Contabilidad',
    },
    update: {},
    create: {
      nombre: 'Contabilidad',
      descripcion: 'Contabilidad y finanzas',
    },
  });

  const [tecnologia, , ventas] = await Promise.all([
    prisma.categoria.upsert({
      where: {
        nombre: 'Tecnología',
      },
      update: {},
      create: {
        nombre: 'Tecnología',
        descripcion: 'Informática, sistemas y tecnología',
      },
    }),

    prisma.categoria.upsert({
      where: {
        nombre: 'Logística',
      },
      update: {},
      create: {
        nombre: 'Logística',
        descripcion: 'Depósito, distribución y logística',
      },
    }),

    prisma.categoria.upsert({
      where: {
        nombre: 'Ventas',
      },
      update: {},
      create: {
        nombre: 'Ventas',
        descripcion: 'Ventas y atención comercial',
      },
    }),
  ]);
  return { administracion, contabilidad, tecnologia, ventas };
}
