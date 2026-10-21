import { PrismaPg } from '@prisma/adapter-pg';
import argon2 from 'argon2';
import 'dotenv/config';

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

  const [admin, usuarioSocio, usuarioDirectivo, usuarioPostulante] =
    await Promise.all([
      prisma.usuario.upsert({
        where: { email: 'admin@ccisj.uy' },
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
      }),

      prisma.usuario.upsert({
        where: { email: 'empresa@ccisj.uy' },
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
      }),

      prisma.usuario.upsert({
        where: { email: 'directivo@ccisj.uy' },
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
      }),

      prisma.usuario.upsert({
        where: { email: 'postulante@ccisj.uy' },
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
      }),
    ]);

  // Evita warning si todavía no usamos admin más abajo.
  void admin;

  // =========================
  // SOCIOS
  // =========================

  const [socio] = await Promise.all([
    prisma.socio.upsert({
      where: { rut: '123456789012' },
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
    }),

    prisma.socio.upsert({
      where: { rut: '987654321098' },
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
    }),
  ]);

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

  // =========================
  // CONFIGURACIÓN DE CUOTA
  // =========================

  await prisma.configuracionCuota.upsert({
    where: {
      vigenciaDesde: new Date('2026-01-01'),
    },
    update: {
      importeBase: 760,
    },
    create: {
      importeBase: 760,
      vigenciaDesde: new Date('2026-01-01'),
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

  await Promise.all([
    prisma.ofertaCategoria.upsert({
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
    }),

    prisma.ofertaCategoria.upsert({
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
      categoriaId: tecnologia.id,
    },
    {
      titulo: 'Desarrollador web',
      descripcion:
        'Desarrollo y mantenimiento de sitios y sistemas web. Se valora experiencia con JavaScript y bases de datos.',
      modalidad: 'HIBRIDO',
      cantidadVacantes: 1,
      categoriaId: tecnologia.id,
    },
    {
      titulo: 'Vendedor de mostrador',
      descripcion:
        'Atención al público, asesoramiento a clientes y manejo de caja.',
      modalidad: 'PRESENCIAL',
      cantidadVacantes: 2,
      categoriaId: ventas.id,
    },
  ];

  for (const { categoriaId, ...datos } of masOfertas) {
    const existente = await prisma.oferta.findFirst({
      where: { titulo: datos.titulo, socioId: socio.id },
    });

    if (existente) continue;

    await prisma.oferta.create({
      data: {
        ...datos,
        socioId: socio.id,
        creadaPor: usuarioSocio.id,
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

  await prisma.categoriaCaja.upsert({
    where: {
      nombre_tipo: {
        nombre: 'Cuotas de socios',
        tipo: 'INGRESO',
      },
    },
    update: {
      activa: true,
    },
    create: {
      nombre: 'Cuotas de socios',
      tipo: 'INGRESO',
      activa: true,
    },
  });

  console.log(`
Seed ejecutado correctamente.

Usuarios de prueba:
ADMIN:       admin@ccisj.uy
SOCIO:       empresa@ccisj.uy
DIRECTIVO:   directivo@ccisj.uy
POSTULANTE:  postulante@ccisj.uy
Password:    1234

Configuración de cuota:
2026 → $760
  `);
}

/**
 * Antes esto era `main().catch(...).finally(...)`, con un `process.exit(1)`
 * dentro del catch. Dos problemas: `process.exit` corta el proceso en el acto,
 * así que el `.finally` nunca llegaba a correr y la conexión quedaba sin
 * cerrar cuando el seed fallaba; y el `.finally` recibía una función async,
 * cuya promesa nadie esperaba.
 *
 * Con `process.exitCode` el proceso termina igual con código 1, pero recién
 * después de que el `finally` desconecte.
 */
async function run() {
  try {
    await main();
  } catch (error) {
    console.error('Error ejecutando seed:');
    console.error(error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

void run();
