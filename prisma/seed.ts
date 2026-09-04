import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';

const adapter = new PrismaPg({
  connectionString: process.env.DB_URL!,
});

const prisma = new PrismaClient({ adapter });

async function main() {
  // =========================
  // USUARIOS
  // =========================

  const admin = await prisma.usuario.upsert({
    where: { email: 'admin@ccisj.uy' },
    update: {},
    create: {
      email: 'admin@ccisj.uy',
      password: 'password_test',
      tipo: 'BACKOFFICE',
    },
  });

  const usuarioSocio = await prisma.usuario.upsert({
    where: { email: 'empresa@ccisj.uy' },
    update: {},
    create: {
      email: 'empresa@ccisj.uy',
      password: 'password_test',
      tipo: 'SOCIO',
    },
  });

  const usuarioPostulante = await prisma.usuario.upsert({
    where: { email: 'postulante@ccisj.uy' },
    update: {},
    create: {
      email: 'postulante@ccisj.uy',
      password: 'password_test',
      tipo: 'POSTULANTE',
    },
  });

  // =========================
  // SOCIO
  // =========================

  const socio = await prisma.socio.upsert({
    where: {
      rut: '123456789012',
    },
    update: {},
    create: {
      usuarioId: usuarioSocio.id,
      nombre: 'Empresa de Prueba',
      rut: '123456789012',
      email: 'empresa@ccisj.uy',
      telefono: '099123456',
      direccion: 'San José',
      tipo: 'COMUN',
    },
  });

  // =========================
  // POSTULANTE
  // =========================

  const postulante = await prisma.postulante.upsert({
    where: {
      usuarioId: usuarioPostulante.id,
    },
    update: {},
    create: {
      usuarioId: usuarioPostulante.id,
      nombre: 'Juan',
      apellido: 'Pérez',
      telefono: '098123456',
    },
  });

  // =========================
  // CV
  // =========================

  await prisma.cv.upsert({
    where: {
      postulanteId: postulante.id,
    },
    update: {},
    create: {
      postulanteId: postulante.id,
      archivoUrl: '/uploads/cv/juan-perez.pdf',
      descripcion: 'CV de prueba de Juan Pérez',
    },
  });

  // =========================
  // CATEGORIAS
  // =========================

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

  await prisma.categoria.upsert({
    where: {
      nombre: 'Tecnología',
    },
    update: {},
    create: {
      nombre: 'Tecnología',
      descripcion: 'Informática, sistemas y tecnología',
    },
  });

  await prisma.categoria.upsert({
    where: {
      nombre: 'Logística',
    },
    update: {},
    create: {
      nombre: 'Logística',
      descripcion: 'Depósito, distribución y logística',
    },
  });

  await prisma.categoria.upsert({
    where: {
      nombre: 'Ventas',
    },
    update: {},
    create: {
      nombre: 'Ventas',
      descripcion: 'Ventas y atención comercial',
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

  // =========================
  // OFERTA
  // =========================

  // Como titulo no es UNIQUE, buscamos primero.
  let oferta = await prisma.oferta.findFirst({
    where: {
      titulo: 'Auxiliar administrativo',
      socioId: socio.id,
    },
  });

  if (!oferta) {
    oferta = await prisma.oferta.create({
      data: {
        socioId: socio.id,
        creadaPor: usuarioSocio.id,
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
  // CATEGORIAS DE LA OFERTA
  // =========================

  await prisma.ofertaCategoria.upsert({
    where: {
      ofertaId_categoriaId: {
        ofertaId: oferta.id,
        categoriaId: administracion.id,
      },
    },
    update: {},
    create: {
      ofertaId: oferta.id,
      categoriaId: administracion.id,
    },
  });

  await prisma.ofertaCategoria.upsert({
    where: {
      ofertaId_categoriaId: {
        ofertaId: oferta.id,
        categoriaId: contabilidad.id,
      },
    },
    update: {},
    create: {
      ofertaId: oferta.id,
      categoriaId: contabilidad.id,
    },
  });

  // =========================
  // POSTULACION
  // =========================

  await prisma.postulacion.upsert({
    where: {
      ofertaId_postulanteId: {
        ofertaId: oferta.id,
        postulanteId: postulante.id,
      },
    },
    update: {},
    create: {
      ofertaId: oferta.id,
      postulanteId: postulante.id,
      estado: 'ENVIADA',
      observaciones: 'Postulación de prueba',
    },
  });

  console.log('Seed ejecutado correctamente.');
}

main()
  .catch((error) => {
    console.error('Error ejecutando seed:');
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
