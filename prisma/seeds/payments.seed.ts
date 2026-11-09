import type { PrismaClient } from '../../src/generated/prisma/client';

const MARCA_SEED = '[SEED-CCISJ-PAGOS-2026]';
const TAMANIO_LOTE = 100;

type PagoPendiente = {
  cuotaId: number;
  socioId: number;
  periodo: string;
  importe: number;
  totalCuota: number;
  pagadoAnterior: number;
  fechaPago: Date;
  marca: string;
};

export async function seedPayments(prisma: PrismaClient) {
  console.time('Seed de pagos');

  const [admin, categoria, socios, cuotas, detalles, pagosSeed] =
    await Promise.all([
      prisma.usuario.findUnique({
        where: { email: 'admin@ccisj.uy' },
        select: { id: true },
      }),

      prisma.categoriaCaja.findUnique({
        where: {
          nombre_tipo: {
            nombre: 'Cuotas de socios',
            tipo: 'INGRESO',
          },
        },
        select: { id: true },
      }),

      prisma.socio.findMany({
        select: { id: true },
        orderBy: { id: 'asc' },
      }),

      prisma.cuota.findMany({
        select: {
          id: true,
          socioId: true,
          periodoDesde: true,
          importeTotal: true,
        },
        orderBy: [{ socioId: 'asc' }, { periodoDesde: 'asc' }],
      }),

      prisma.pagoCuotaDetalle.findMany({
        where: {
          pago: {
            anulado: false,
          },
        },
        select: {
          cuotaId: true,
          importeAplicado: true,
        },
      }),

      prisma.pagoCuota.findMany({
        where: {
          observaciones: {
            startsWith: MARCA_SEED,
          },
        },
        select: {
          observaciones: true,
        },
      }),
    ]);

  if (!admin) {
    throw new Error('No existe el administrador del seed.');
  }

  if (!categoria) {
    throw new Error('No existe la categoría Cuotas de socios.');
  }

  const pagadoPorCuota = new Map<number, number>();

  for (const detalle of detalles) {
    pagadoPorCuota.set(
      detalle.cuotaId,
      (pagadoPorCuota.get(detalle.cuotaId) ?? 0) +
        Number(detalle.importeAplicado),
    );
  }

  const marcasExistentes = new Set(
    pagosSeed
      .map((pago) => pago.observaciones)
      .filter((marca): marca is string => marca !== null),
  );

  const indicePorSocio = new Map(
    socios.map((socio, indice) => [socio.id, indice]),
  );

  const contadorPorSocio = new Map<number, number>();
  const pendientes: PagoPendiente[] = [];

  for (const cuota of cuotas) {
    const indiceSocio = indicePorSocio.get(cuota.socioId);

    if (indiceSocio === undefined) continue;

    const indiceCuota = contadorPorSocio.get(cuota.socioId) ?? 0;

    contadorPorSocio.set(cuota.socioId, indiceCuota + 1);

    const grupo = indiceSocio % 5;

    if (grupo === 3 && indiceCuota % 3 === 0) continue;
    if (grupo === 4 && indiceCuota % 2 === 0) continue;

    const totalCuota = Number(cuota.importeTotal);
    const pagadoAnterior = pagadoPorCuota.get(cuota.id) ?? 0;

    const objetivo =
      grupo === 4 ? Math.round(totalCuota * 50) / 100 : totalCuota;

    const importe = Math.round((objetivo - pagadoAnterior) * 100) / 100;

    if (importe <= 0) continue;

    const periodo = cuota.periodoDesde.toISOString().slice(0, 7);

    const marca = `${MARCA_SEED}-${cuota.socioId}-${periodo}`;

    if (marcasExistentes.has(marca)) continue;

    pendientes.push({
      cuotaId: cuota.id,
      socioId: cuota.socioId,
      periodo,
      importe,
      totalCuota,
      pagadoAnterior,
      marca,
      // El 10 de cada mes, salvo en el mes en curso antes del 10: ahí, hoy.
      // Si no, la demo mostraba pagos con fecha futura.
      fechaPago: new Date(
        Math.min(
          Date.UTC(
            cuota.periodoDesde.getUTCFullYear(),
            cuota.periodoDesde.getUTCMonth(),
            10,
            12,
          ),
          Date.now(),
        ),
      ),
    });
  }

  console.log(`Seed de pagos: ${pendientes.length} pagos pendientes.`);

  let creados = 0;

  for (let inicio = 0; inicio < pendientes.length; inicio += TAMANIO_LOTE) {
    const lote = pendientes.slice(inicio, inicio + TAMANIO_LOTE);

    await prisma.$transaction(
      async (tx) => {
        // Inserción masiva de pagos.
        const pagos = await tx.pagoCuota.createManyAndReturn({
          data: lote.map((item) => ({
            socioId: item.socioId,
            registradoPorId: admin.id,
            importe: item.importe,
            fechaPago: item.fechaPago,
            medioPago: 'EFECTIVO',
            observaciones: item.marca,
          })),
          select: {
            id: true,
            observaciones: true,
          },
        });

        const pagosPorMarca = new Map(
          pagos.map((pago) => [pago.observaciones, pago.id]),
        );

        const detallesNuevos = lote.map((item) => {
          const pagoId = pagosPorMarca.get(item.marca);

          if (pagoId === undefined) {
            throw new Error(`No se encontró el pago ${item.marca}`);
          }

          return {
            pagoId,
            cuotaId: item.cuotaId,
            importeAplicado: item.importe,
          };
        });

        await tx.pagoCuotaDetalle.createMany({
          data: detallesNuevos,
        });

        // Crear los ingresos correspondientes en Caja.
        await tx.movimientoCaja.createMany({
          data: lote.map((item) => {
            const pagoId = pagosPorMarca.get(item.marca);

            if (pagoId === undefined) {
              throw new Error(`No se encontró el pago ${item.marca}`);
            }

            return {
              tipo: 'INGRESO' as const,
              categoriaId: categoria.id,
              concepto:
                `Pago de cuota ${item.periodo} - ` + `Socio #${item.socioId}`,
              importe: item.importe,
              fecha: item.fechaPago,
              registradoPorId: admin.id,
              pagoCuotaId: pagoId,
              observaciones: item.marca,
            };
          }),
        });

        // Actualizar estados agrupados.
        const pagadas = lote
          .filter(
            (item) =>
              item.pagadoAnterior + item.importe >= item.totalCuota - 0.001,
          )
          .map((item) => item.cuotaId);

        const parciales = lote
          .filter(
            (item) =>
              item.pagadoAnterior + item.importe < item.totalCuota - 0.001,
          )
          .map((item) => item.cuotaId);

        if (pagadas.length > 0) {
          await tx.cuota.updateMany({
            where: {
              id: { in: pagadas },
            },
            data: {
              estado: 'PAGADA',
            },
          });
        }

        if (parciales.length > 0) {
          await tx.cuota.updateMany({
            where: {
              id: { in: parciales },
            },
            data: {
              estado: 'PARCIAL',
            },
          });
        }
      },
      {
        maxWait: 10000,
        timeout: 30000,
      },
    );

    creados += lote.length;

    console.log(`Pagos creados: ${creados}/${pendientes.length}`);
  }

  console.timeEnd('Seed de pagos');
  console.log(`Seed de pagos finalizado: ${creados} nuevos.`);
}
