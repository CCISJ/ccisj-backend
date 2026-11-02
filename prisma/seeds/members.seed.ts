import argon2 from 'argon2';

import type { PrismaClient } from '../../src/generated/prisma/client';

type EmpresaSeed = {
  razonSocial: string;
  titular: string;
  giroComercial: string;
  tipo: 'COMUN' | 'DIRECTIVO';
};

const empresas: EmpresaSeed[] = [
  {
    razonSocial: 'Supermercado Central SRL',
    titular: 'Juan Pérez',
    giroComercial: 'Supermercado',
    tipo: 'COMUN',
  },
  {
    razonSocial: 'Ferretería del Sur',
    titular: 'Laura Martínez',
    giroComercial: 'Ferretería',
    tipo: 'COMUN',
  },
  {
    razonSocial: 'Panadería La Espiga',
    titular: 'Roberto Fernández',
    giroComercial: 'Panadería',
    tipo: 'COMUN',
  },
  {
    razonSocial: 'Farmacia San José',
    titular: 'Ana López',
    giroComercial: 'Farmacia',
    tipo: 'COMUN',
  },
  {
    razonSocial: 'Tienda Moderna',
    titular: 'Sofía Rodríguez',
    giroComercial: 'Vestimenta',
    tipo: 'COMUN',
  },
  {
    razonSocial: 'Electro Hogar SRL',
    titular: 'Martín García',
    giroComercial: 'Electrodomésticos',
    tipo: 'COMUN',
  },
  {
    razonSocial: 'Óptica Visión',
    titular: 'Valentina Castro',
    giroComercial: 'Óptica',
    tipo: 'COMUN',
  },
  {
    razonSocial: 'Librería Horizonte',
    titular: 'Diego Pereira',
    giroComercial: 'Librería y papelería',
    tipo: 'COMUN',
  },
  {
    razonSocial: 'Automotora Ruta 3',
    titular: 'Federico Silva',
    giroComercial: 'Automotora',
    tipo: 'DIRECTIVO',
  },
  {
    razonSocial: 'Restaurante El Encuentro',
    titular: 'Camila Núñez',
    giroComercial: 'Gastronomía',
    tipo: 'COMUN',
  },
  {
    razonSocial: 'Carnicería Don Pedro',
    titular: 'Pedro Acosta',
    giroComercial: 'Carnicería',
    tipo: 'COMUN',
  },
  {
    razonSocial: 'Veterinaria del Parque',
    titular: 'Lucía Torres',
    giroComercial: 'Veterinaria',
    tipo: 'COMUN',
  },
  {
    razonSocial: 'Inmobiliaria San José',
    titular: 'Andrés Morales',
    giroComercial: 'Inmobiliaria',
    tipo: 'COMUN',
  },
  {
    razonSocial: 'Estudio Contable Integral',
    titular: 'Gabriela Suárez',
    giroComercial: 'Servicios contables',
    tipo: 'DIRECTIVO',
  },
  {
    razonSocial: 'Mueblería El Roble',
    titular: 'Nicolás Cabrera',
    giroComercial: 'Mueblería',
    tipo: 'COMUN',
  },
  {
    razonSocial: 'Pinturería Color',
    titular: 'Mariana Díaz',
    giroComercial: 'Pinturería',
    tipo: 'COMUN',
  },
  {
    razonSocial: 'Distribuidora del Oeste',
    titular: 'Javier Sosa',
    giroComercial: 'Distribución',
    tipo: 'COMUN',
  },
  {
    razonSocial: 'Hotel Plaza',
    titular: 'Carolina Viera',
    giroComercial: 'Hotelería',
    tipo: 'COMUN',
  },
  {
    razonSocial: 'Gimnasio Activa',
    titular: 'Sebastián Olivera',
    giroComercial: 'Gimnasio',
    tipo: 'COMUN',
  },
  {
    razonSocial: 'Tecnología Digital SRL',
    titular: 'Agustín Méndez',
    giroComercial: 'Informática',
    tipo: 'COMUN',
  },
  {
    razonSocial: 'Agroinsumos del Campo',
    titular: 'Pablo Rodríguez',
    giroComercial: 'Agroinsumos',
    tipo: 'DIRECTIVO',
  },
  {
    razonSocial: 'Zapatería Avenida',
    titular: 'Florencia Medina',
    giroComercial: 'Calzado',
    tipo: 'COMUN',
  },
  {
    razonSocial: 'Bazar La Familia',
    titular: 'Natalia Romero',
    giroComercial: 'Bazar',
    tipo: 'COMUN',
  },
  {
    razonSocial: 'Cerrajería Central',
    titular: 'Héctor Pérez',
    giroComercial: 'Cerrajería',
    tipo: 'COMUN',
  },
  {
    razonSocial: 'Centro de Impresiones',
    titular: 'Matías Ramos',
    giroComercial: 'Imprenta',
    tipo: 'COMUN',
  },
  {
    razonSocial: 'Joyería Elegance',
    titular: 'Daniela Gómez',
    giroComercial: 'Joyería',
    tipo: 'COMUN',
  },
  {
    razonSocial: 'Lavadero Express',
    titular: 'Emiliano Álvarez',
    giroComercial: 'Lavadero',
    tipo: 'COMUN',
  },
  {
    razonSocial: 'Repuestos del Centro',
    titular: 'Ignacio González',
    giroComercial: 'Repuestos automotores',
    tipo: 'COMUN',
  },
  {
    razonSocial: 'Clínica Dental Sonrisa',
    titular: 'Paula Herrera',
    giroComercial: 'Odontología',
    tipo: 'COMUN',
  },
  {
    razonSocial: 'Florería Primavera',
    titular: 'Micaela Pérez',
    giroComercial: 'Florería',
    tipo: 'COMUN',
  },
  {
    razonSocial: 'Heladería Artesanal',
    titular: 'Rodrigo Bentancur',
    giroComercial: 'Heladería',
    tipo: 'COMUN',
  },
  {
    razonSocial: 'Servicios Eléctricos SJ',
    titular: 'Gonzalo Pereira',
    giroComercial: 'Instalaciones eléctricas',
    tipo: 'COMUN',
  },
  {
    razonSocial: 'Transporte del Sur',
    titular: 'Mauricio López',
    giroComercial: 'Transporte',
    tipo: 'DIRECTIVO',
  },
  {
    razonSocial: 'Pet Shop Mascotas',
    titular: 'Luciana Martínez',
    giroComercial: 'Mascotas',
    tipo: 'COMUN',
  },
  {
    razonSocial: 'Perfumería Esencias',
    titular: 'Antonella García',
    giroComercial: 'Perfumería',
    tipo: 'COMUN',
  },
  {
    razonSocial: 'Taller Mecánico Ruta',
    titular: 'Cristian Silva',
    giroComercial: 'Taller mecánico',
    tipo: 'COMUN',
  },
  {
    razonSocial: 'Papelería Escolar',
    titular: 'Belén Núñez',
    giroComercial: 'Papelería',
    tipo: 'COMUN',
  },
  {
    razonSocial: 'Consultora Empresarial',
    titular: 'Victoria Castro',
    giroComercial: 'Consultoría',
    tipo: 'COMUN',
  },
  {
    razonSocial: 'Materiales del Este',
    titular: 'Raúl Fernández',
    giroComercial: 'Materiales de construcción',
    tipo: 'COMUN',
  },
  {
    razonSocial: 'Cafetería Aroma',
    titular: 'Josefina Cabrera',
    giroComercial: 'Cafetería',
    tipo: 'COMUN',
  },
  {
    razonSocial: 'Seguridad Integral',
    titular: 'Leonardo Acosta',
    giroComercial: 'Seguridad',
    tipo: 'COMUN',
  },
  {
    razonSocial: 'Agencia de Viajes Horizonte',
    titular: 'Romina Suárez',
    giroComercial: 'Turismo',
    tipo: 'COMUN',
  },
  {
    razonSocial: 'Tienda Deportiva Gol',
    titular: 'Bruno Martínez',
    giroComercial: 'Artículos deportivos',
    tipo: 'COMUN',
  },
  {
    razonSocial: 'Fábrica de Pastas Italia',
    titular: 'Marcelo Díaz',
    giroComercial: 'Alimentación',
    tipo: 'COMUN',
  },
  {
    razonSocial: 'Centro de Estética Bella',
    titular: 'Agustina Torres',
    giroComercial: 'Estética',
    tipo: 'COMUN',
  },
  {
    razonSocial: 'Soluciones Informáticas',
    titular: 'Facundo Rodríguez',
    giroComercial: 'Servicios informáticos',
    tipo: 'COMUN',
  },
  {
    razonSocial: 'Barraca San José',
    titular: 'Eduardo Viera',
    giroComercial: 'Barraca',
    tipo: 'DIRECTIVO',
  },
  {
    razonSocial: 'Distribuidora Atlántica',
    titular: 'Verónica Morales',
    giroComercial: 'Comercio mayorista',
    tipo: 'COMUN',
  },
];

export async function seedMembers(
  prisma: PrismaClient,
  usuarioSocioId: number,
  usuarioDirectivoId: number,
) {
  // Conservar los dos socios originales.
  const [socio, directivo] = await Promise.all([
    prisma.socio.upsert({
      where: { rut: '123456789012' },
      update: {},
      create: {
        usuarioId: usuarioSocioId,
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
      update: {},
      create: {
        usuarioId: usuarioDirectivoId,
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

  const password = await argon2.hash('1234');

  const datos = empresas.map((empresa, index) => {
    const numero = index + 1;
    const email = `socio${String(numero).padStart(2, '0')}@demo.ccisj.test`;
    const rut = `21990000${String(numero).padStart(4, '0')}`;

    return { ...empresa, numero, email, rut, index };
  });

  // 1. Crear usuarios en una única operación.
  const usuariosCreados = await prisma.usuario.createMany({
    data: datos.map(({ email }) => ({
      email,
      password,
      tipo: 'SOCIO' as const,
      activo: true,
    })),
    skipDuplicates: true,
  });

  // 2. Recuperar sus IDs con una sola consulta.
  const usuarios = await prisma.usuario.findMany({
    where: {
      email: { in: datos.map((item) => item.email) },
    },
    select: { id: true, email: true },
  });

  const usuariosPorEmail = new Map(
    usuarios.map((usuario) => [usuario.email, usuario.id]),
  );

  // 3. Preparar socios para inserción masiva.
  const sociosNuevos = datos.map((empresa) => {
    const usuarioId = usuariosPorEmail.get(empresa.email);

    if (usuarioId === undefined) {
      throw new Error(`No se encontró el usuario ${empresa.email}`);
    }

    return {
      usuarioId,
      razonSocial: empresa.razonSocial,
      titular: empresa.titular,
      giroComercial: empresa.giroComercial,
      tipo: empresa.tipo,
      rut: empresa.rut,
      numeroBps: String(8000000 + empresa.numero),
      fechaInicioEmpresa: new Date(
        Date.UTC(2010 + (empresa.index % 10), empresa.index % 12, 10),
      ),
      fechaAfiliacion: new Date(
        Date.UTC(
          2018 + (empresa.index % 7),
          empresa.index % 12,
          1 + (empresa.index % 20),
        ),
      ),
      direccion: `${
        [
          '25 de Mayo',
          'Artigas',
          'Asamblea',
          'Treinta y Tres',
          'Colón',
          'Sarandí',
          'Bengoa',
          'Rivera',
        ][empresa.index % 8]
      } ${100 + empresa.numero * 7}`,
      ciudad: [
        'San José de Mayo',
        'Libertad',
        'Ciudad del Plata',
        'Rodríguez',
        'Ecilda Paullier',
      ][empresa.index % 5],
      celular: `09${String(1000000 + empresa.numero).padStart(7, '0')}`,
      telefono: `4342${String(1000 + empresa.numero)}`,
      email: empresa.email,
      observaciones: 'Empresa ficticia generada para pruebas de desarrollo.',
    };
  });

  const resultado = await prisma.socio.createMany({
    data: sociosNuevos,
    skipDuplicates: true,
  });

  // 4. Recuperar los socios para devolverlos.
  const socios = await prisma.socio.findMany({
    where: {
      rut: { in: datos.map((empresa) => empresa.rut) },
    },
    orderBy: { id: 'asc' },
  });

  console.log(
    `Seed de socios: ${resultado.count} empresas nuevas, ` +
      `${socios.length + 2} empresas de prueba disponibles. ` +
      `${usuariosCreados.count} usuarios nuevos.`,
  );

  return {
    socio,
    directivo,
    socios: [socio, directivo, ...socios],
  };
}
