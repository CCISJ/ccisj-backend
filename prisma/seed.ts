import 'dotenv/config';

import argon2 from 'argon2';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';

const adapter = new PrismaPg({
  connectionString: process.env.DB_URL!,
});

const prisma = new PrismaClient({ adapter });

async function main() {
  const password = await argon2.hash('1234');

  // =========================
  // USUARIOS
  // =========================

  const admin = await prisma.usuario.upsert({
    where: {
      email: 'admin@ccisj.uy',
    },
    update: {
      password,
      tipo: 'ADMIN',
      activo: true,
    },
    create: {
      email: 'admin@ccisj.uy',
      password,
      tipo: 'ADMIN',
    },
  });

  const usuarioSocio = await prisma.usuario.upsert({
    where: {
      email: 'empresa@ccisj.uy',
    },
    update: {
      password,
      tipo: 'SOCIO',
      activo: true,
    },
    create: {
      email: 'empresa@ccisj.uy',
      password,
      tipo: 'SOCIO',
    },
  });

  const usuarioDirectivo = await prisma.usuario.upsert({
    where: {
      email: 'directivo@ccisj.uy',
    },
    update: {
      password,
      tipo: 'SOCIO',
      activo: true,
    },
    create: {
      email: 'directivo@ccisj.uy',
      password,
      tipo: 'SOCIO',
    },
  });

  const usuarioPostulante = await prisma.usuario.upsert({
    where: {
      email: 'postulante@ccisj.uy',
    },
    update: {
      password,
      tipo: 'POSTULANTE',
      activo: true,
    },
    create: {
      email: 'postulante@ccisj.uy',
      password,
      tipo: 'POSTULANTE',
    },
  });

  // =========================
  // SOCIO COMÚN
  // =========================

  const socio = await prisma.socio.upsert({
    where: {
      rut: '123456789012',
    },
    update: {
      usuarioId: usuarioSocio.id,
      razonSocial: 'Empresa de Prueba SRL',
      titular: 'Carlos Rodríguez',
      giroComercial: 'Comercio general',
      numeroBps: '1234567',
      direccion: '25 de Mayo 123',
      ciudad: 'San José de Mayo',
      celular: '099123456',
      telefono: '43421234',
      email: 'empresa@ccisj.uy',
      tipo: 'COMUN',
    },
    create: {
      usuarioId: usuarioSocio.id,
      razonSocial: 'Empresa de Prueba SRL',
      titular: 'Carlos Rodríguez',
      giroComercial: 'Comercio general',
      tipo: 'COMUN',

      rut: '123456789012',
      numeroBps: '1234567',

      fechaInicioEmpresa: new Date('2015-03-10'),
      fechaAfiliacion: new Date('2020-06-15'),

      direccion: '25 de Mayo 123',
      ciudad: 'San José de Mayo',

      celular: '099123456',
      telefono: '43421234',

      email: 'empresa@ccisj.uy',

      observaciones: 'Socio de prueba',
    },
  });

  // =========================
  // SOCIO DIRECTIVO
  // =========================

  await prisma.socio.upsert({
    where: {
      rut: '987654321098',
    },
    update: {
      usuarioId: usuarioDirectivo.id,
      razonSocial: 'Empresa Directiva SA',
      titular: 'María González',
      giroComercial: 'Servicios',
      numeroBps: '7654321',
      direccion: 'Artigas 456',
      ciudad: 'San José de Mayo',
      celular: '098987654',
      telefono: '43425678',
      email: 'directivo@ccisj.uy',
      tipo: 'DIRECTIVO',
    },
    create: {
      usuarioId: usuarioDirectivo.id,
      razonSocial: 'Empresa Directiva SA',
      titular: 'María González',
      giroComercial: 'Servicios',
      tipo: 'DIRECTIVO',

      rut: '987654321098',
      numeroBps: '7654321',

      fechaInicioEmpresa: new Date('2010-08-20'),
      fechaAfiliacion: new Date('2018-02-01'),

      direccion: 'Artigas 456',
      ciudad: 'San José de Mayo',

      celular: '098987654',
      telefono: '43425678',

      email: 'directivo@ccisj.uy',

      observaciones: 'Socio directivo de prueba',
    },
  });

  // =========================
  // POSTULANTE
  // =========================

  const postulante = await prisma.postulante.upsert({
    where: {
      usuarioId: usuarioPostulante.id,
    },
    update: {
      nombre: 'Juan',
      apellido: 'Pérez',
      telefono: '098123456',
    },
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

  // Un postulante puede tener varios CV.
  // No hacemos upsert solo por postulanteId.

  const cvExistente = await prisma.cv.findFirst({
    where: {
      postulanteId: postulante.id,
      archivoUrl: '/uploads/cv/juan-perez.pdf',
    },
  });

  if (!cvExistente) {
    await prisma.cv.create({
      data: {
        postulanteId: postulante.id,
        archivoUrl: '/uploads/cv/juan-perez.pdf',
        descripcion: 'CV de prueba de Juan Pérez',
      },
    });
  }

  // =========================
  // CATEGORÍAS
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
  // CATEGORÍAS DE LA OFERTA
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
  // POSTULACIÓN
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
  console.log('');
  console.log('Usuarios de prueba:');
  console.log('ADMIN:       admin@ccisj.uy');
  console.log('SOCIO:       empresa@ccisj.uy');
  console.log('DIRECTIVO:   directivo@ccisj.uy');
  console.log('POSTULANTE:  postulante@ccisj.uy');
  console.log('Password:    1234');
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
