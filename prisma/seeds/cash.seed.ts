import type { PrismaClient } from '../../src/generated/prisma/client';

type CashType = 'INGRESO' | 'EGRESO';

const categorias: { nombre: string; tipo: CashType }[] = [
  { nombre: 'Cuotas de socios', tipo: 'INGRESO' },
  { nombre: 'Eventos y actividades', tipo: 'INGRESO' },
  { nombre: 'Alquiler de espacios', tipo: 'INGRESO' },
  { nombre: 'Servicios prestados', tipo: 'INGRESO' },
  { nombre: 'Otros ingresos', tipo: 'INGRESO' },
  { nombre: 'Servicios públicos', tipo: 'EGRESO' },
  { nombre: 'Sueldos y honorarios', tipo: 'EGRESO' },
  { nombre: 'Mantenimiento', tipo: 'EGRESO' },
  { nombre: 'Papelería e insumos', tipo: 'EGRESO' },
  { nombre: 'Publicidad', tipo: 'EGRESO' },
  { nombre: 'Otros egresos', tipo: 'EGRESO' },
];

export async function seedCashCategories(prisma: PrismaClient) {
  for (const categoria of categorias) {
    await prisma.categoriaCaja.upsert({
      where: {
        nombre_tipo: {
          nombre: categoria.nombre,
          tipo: categoria.tipo,
        },
      },
      update: {
        activa: true,
      },
      create: {
        ...categoria,
        activa: true,
      },
    });
  }

  console.log(`Seed de Caja: ${categorias.length} categorías verificadas.`);
}
