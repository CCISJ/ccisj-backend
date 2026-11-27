import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { prisma } from '../src/config/prisma';
import { createMember, deleteUsers } from './session';

/**
 * La migración 20261128120000 corre el vencimiento de las cuotas ya
 * generadas al último día del mes siguiente a su período. Se prueba el SQL
 * real de la migración, dentro de una transacción que se deshace al final:
 * así no cambia nada de lo que usan los demás tests.
 */
const MIGRACION = readFileSync(
  join(
    __dirname,
    '../prisma/migrations/20261128120000_vencimiento_mes_siguiente/migration.sql',
  ),
  'utf8',
);

/** Para deshacer la transacción a propósito, después de mirar el resultado. */
class Deshacer extends Error {}

const dia = (fecha: Date) => fecha.toISOString().slice(0, 10);

describe('Migración: vencimiento al fin del mes siguiente', () => {
  let member: Awaited<ReturnType<typeof createMember>>;

  /** Período (AAAA-MM-01) → vencimiento viejo que tenía la cuota. */
  const CUOTAS: [string, string, string][] = [
    // período,     vencía (regla vieja), vence (regla nueva)
    ['2026-09-01', '2026-09-30', '2026-10-31'], // fin del mismo mes
    ['2026-10-01', '2026-10-15', '2026-11-30'], // el 15, como el seed viejo
    ['2026-12-01', '2026-12-31', '2027-01-31'], // cambio de año
    ['2027-01-01', '2027-01-31', '2027-02-28'], // a febrero
    ['2028-01-01', '2028-01-31', '2028-02-29'], // a febrero bisiesto
    ['2026-11-01', '2026-12-31', '2026-12-31'], // ya cumple: no cambia
  ];

  beforeAll(async () => {
    member = await createMember();

    // Dado de baja: la generación masiva de otros tests (fee.test.ts), que
    // corre en paralelo, solo crea cuotas a los socios activos. Si no, le
    // crearía una cuota del mismo período que las de acá.
    await prisma.usuario.update({
      where: { id: member.userId },
      data: { activo: false },
    });

    await prisma.cuota.createMany({
      data: CUOTAS.map(([periodo, vencia]) => {
        const desde = new Date(`${periodo}T00:00:00Z`);

        return {
          socioId: member.socioId,
          periodoDesde: desde,
          periodoHasta: new Date(
            Date.UTC(desde.getUTCFullYear(), desde.getUTCMonth() + 1, 0),
          ),
          fechaVencimiento: new Date(`${vencia}T00:00:00Z`),
          importeBase: 760,
          importeAjustes: 0,
          importeTotal: 760,
          estado: 'PENDIENTE' as const,
        };
      }),
    });
  });

  afterAll(async () => {
    await prisma.cuota.deleteMany({ where: { socioId: member.socioId } });
    await deleteUsers([member.userId]);
  });

  function cuotasDelSocio(tx: Pick<typeof prisma, 'cuota'>) {
    return tx.cuota.findMany({
      where: { socioId: member.socioId },
      orderBy: { periodoDesde: 'asc' },
    });
  }

  it('lleva cada vencimiento al último día del mes siguiente, sin tocar nada más', async () => {
    const antes = await cuotasDelSocio(prisma);

    await expect(
      prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(MIGRACION);

        const despues = await cuotasDelSocio(tx);

        for (const [periodo, , vence] of CUOTAS) {
          const cuota = despues.find((c) => dia(c.periodoDesde) === periodo);

          expect(dia(cuota!.fechaVencimiento), `cuota de ${periodo}`).toBe(
            vence,
          );
        }

        // Solo cambió la fecha de vencimiento.
        expect(
          despues.map(({ fechaVencimiento: _f, ...resto }) => resto),
        ).toEqual(antes.map(({ fechaVencimiento: _f, ...resto }) => resto));

        // Correrla otra vez no cambia nada. Se miran solo las cuotas de este
        // socio: otros tests crean cuotas en paralelo.
        await tx.$executeRawUnsafe(MIGRACION);
        expect(await cuotasDelSocio(tx)).toEqual(despues);

        throw new Deshacer();
      }),
    ).rejects.toBeInstanceOf(Deshacer);

    // La transacción se deshizo: las cuotas siguen como estaban.
    expect(await cuotasDelSocio(prisma)).toEqual(antes);
  });
});
