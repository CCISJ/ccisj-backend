import type { PrismaClient } from '../../src/generated/prisma/client';

const MARCA_SEED = '[SEED-CCISJ-CAJA-2026]';

const conceptos = [
  {
    categoria: 'Eventos y actividades',
    tipo: 'INGRESO',
    concepto: 'Inscripción a actividad comercial',
    minimo: 1500,
    maximo: 8000,
  },
  {
    categoria: 'Alquiler de espacios',
    tipo: 'INGRESO',
    concepto: 'Alquiler de salón para evento',
    minimo: 3000,
    maximo: 12000,
  },
  {
    categoria: 'Servicios prestados',
    tipo: 'INGRESO',
    concepto: 'Servicio a empresa asociada',
    minimo: 1000,
    maximo: 5000,
  },
  {
    categoria: 'Otros ingresos',
    tipo: 'INGRESO',
    concepto: 'Ingreso extraordinario',
    minimo: 500,
    maximo: 3500,
  },
  {
    categoria: 'Servicios públicos',
    tipo: 'EGRESO',
    concepto: 'Pago de servicios públicos',
    minimo: 2000,
    maximo: 6500,
  },
  {
    categoria: 'Sueldos y honorarios',
    tipo: 'EGRESO',
    concepto: 'Pago de honorarios profesionales',
    minimo: 5000,
    maximo: 18000,
  },
  {
    categoria: 'Mantenimiento',
    tipo: 'EGRESO',
    concepto: 'Mantenimiento de instalaciones',
    minimo: 1000,
    maximo: 7000,
  },
  {
    categoria: 'Papelería e insumos',
    tipo: 'EGRESO',
    concepto: 'Compra de insumos de oficina',
    minimo: 400,
    maximo: 2500,
  },
  {
    categoria: 'Publicidad',
    tipo: 'EGRESO',
    concepto: 'Campaña de difusión comercial',
    minimo: 1500,
    maximo: 9000,
  },
  {
    categoria: 'Otros egresos',
    tipo: 'EGRESO',
    concepto: 'Gasto administrativo',
    minimo: 500,
    maximo: 3000,
  },
] as const;

export async function seedCashMovements(prisma: PrismaClient) {
  const [admin, categorias, existentes] = await Promise.all([
    prisma.usuario.findUnique({
      where: { email: 'admin@ccisj.uy' },
      select: { id: true },
    }),

    prisma.categoriaCaja.findMany({
      select: { id: true, nombre: true, tipo: true },
    }),

    prisma.movimientoCaja.findMany({
      where: {
        concepto: {
          contains: MARCA_SEED,
        },
      },
      select: { concepto: true },
    }),
  ]);

  if (!admin) {
    throw new Error('No existe el administrador del seed.');
  }

  const categoriasPorClave = new Map(
    categorias.map((categoria) => [
      `${categoria.tipo}:${categoria.nombre}`,
      categoria.id,
    ]),
  );

  // Identificar movimientos ya creados en ejecuciones anteriores.
  const marcasExistentes = new Set<string>();

  for (const movimiento of existentes) {
    const marca = movimiento.concepto.match(/\[SEED-CCISJ-CAJA-2026\]-\d{3}/);

    if (marca) {
      marcasExistentes.add(marca[0]);
    }
  }

  const movimientos: Array<{
    tipo: 'INGRESO' | 'EGRESO';
    categoriaId: number;
    concepto: string;
    importe: number;
    fecha: Date;
    registradoPorId: number;
  }> = [];

  for (let i = 0; i < 100; i++) {
    const plantilla = conceptos[i % conceptos.length];

    const categoriaId = categoriasPorClave.get(
      `${plantilla.tipo}:${plantilla.categoria}`,
    );

    if (categoriaId === undefined) {
      throw new Error(
        `No existe la categoría ${plantilla.categoria} (${plantilla.tipo}).`,
      );
    }

    const marca = `${MARCA_SEED}-${String(i + 1).padStart(3, '0')}`;

    if (marcasExistentes.has(marca)) {
      continue;
    }

    const rango = plantilla.maximo - plantilla.minimo;

    const importe = plantilla.minimo + ((i * 137 + 89) % (rango + 1));

    const mes = i % 10;
    const dia = 1 + ((i * 7) % 28);

    movimientos.push({
      tipo: plantilla.tipo,
      categoriaId,
      concepto: `${plantilla.concepto} ${marca}`,
      importe,
      fecha: new Date(Date.UTC(2026, mes, dia, 12)),
      registradoPorId: admin.id,
    });
  }

  if (movimientos.length === 0) {
    console.log('Seed de Caja: los 100 movimientos manuales ya existen.');
    return;
  }

  // Inserción masiva: una consulta en lugar de una por movimiento.
  const resultado = await prisma.movimientoCaja.createMany({
    data: movimientos,
  });

  console.log(
    `Seed de Caja: ${resultado.count} movimientos creados, ` +
      `${100 - resultado.count} ya existentes.`,
  );
}
