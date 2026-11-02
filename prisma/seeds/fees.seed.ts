import type { PrismaClient } from '../../src/generated/prisma/client';

export async function seedFeeConfiguration(prisma: PrismaClient) {
  const importeBase = 760;

  await prisma.configuracionCuota.upsert({
    where: {
      vigenciaDesde: new Date('2026-01-01'),
    },
    update: {
      importeBase,
    },
    create: {
      importeBase,
      vigenciaDesde: new Date('2026-01-01'),
    },
  });

  const socios = await prisma.socio.findMany({
    select: { id: true },
  });

  const ahora = new Date();
  const anio = ahora.getUTCFullYear();
  const mes = ahora.getUTCMonth();

  const cuotas = socios.flatMap((socio) =>
    Array.from({ length: 12 }, (_, indice) => {
      const desplazamiento = 11 - indice;

      const periodoDesde = new Date(Date.UTC(anio, mes - desplazamiento, 1));

      const periodoHasta = new Date(
        Date.UTC(anio, mes - desplazamiento + 1, 0),
      );

      const fechaVencimiento = new Date(
        Date.UTC(anio, mes - desplazamiento, 15),
      );

      return {
        socioId: socio.id,
        periodoDesde,
        periodoHasta,
        fechaVencimiento,
        importeBase,
        importeAjustes: 0,
        importeTotal: importeBase,
        estado: 'PENDIENTE' as const,
      };
    }),
  );

  const TAMANIO_LOTE = 200;
  let creadas = 0;

  for (let i = 0; i < cuotas.length; i += TAMANIO_LOTE) {
    const lote = cuotas.slice(i, i + TAMANIO_LOTE);

    const resultado = await prisma.cuota.createMany({
      data: lote,
      skipDuplicates: true,
    });

    creadas += resultado.count;
  }

  console.log(
    `Seed de cuotas: ${creadas} creadas, ` +
      `${cuotas.length - creadas} ya existentes.`,
  );
}
