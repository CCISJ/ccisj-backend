import { prisma } from '@/config/prisma';
import type { Prisma } from '@/generated/prisma/client';

type CreateEmailData = Prisma.EnvioEmailUncheckedCreateInput;

export function create(data: CreateEmailData) {
  return prisma.envioEmail.create({
    data,
  });
}

export function findPending(limit = 50) {
  return prisma.envioEmail.findMany({
    where: {
      estado: 'PENDIENTE',
      OR: [{ proximoIntento: null }, { proximoIntento: { lte: new Date() } }],
    },
    orderBy: {
      fechaCreacion: 'asc',
    },
    take: limit,
  });
}

export async function claim(id: number) {
  const result = await prisma.envioEmail.updateMany({
    where: {
      id,
      estado: 'PENDIENTE',
      OR: [{ proximoIntento: null }, { proximoIntento: { lte: new Date() } }],
    },
    data: {
      estado: 'ENVIANDO',
      intentos: { increment: 1 },
      fechaInicioEnvio: new Date(),
    },
  });

  return result.count === 1;
}

export function markAsSent(id: number, resendId: string | null) {
  return prisma.envioEmail.update({
    where: { id },
    data: {
      estado: 'ENVIADO',
      resendId,
      fechaEnvio: new Date(),
      ultimoError: null,
      proximoIntento: null,
      fechaInicioEnvio: null,
    },
  });
}

/**
 * Los que el worker no manda por estar en modo de prueba: quedan FALLIDO con
 * el motivo, para que nadie los mande después. Solo toca los que siguen
 * PENDIENTE (otro proceso pudo haber tomado alguno). Devuelve cuántos marcó.
 */
export async function markAsSkipped(ids: number[]) {
  if (ids.length === 0) return 0;

  const result = await prisma.envioEmail.updateMany({
    where: { id: { in: ids }, estado: 'PENDIENTE' },
    data: {
      estado: 'FALLIDO',
      ultimoError:
        'No se envió: el worker estaba en modo de prueba (EMAIL_TEST_RECIPIENT).',
      proximoIntento: null,
    },
  });

  return result.count;
}

export async function markAsFailed(
  id: number,
  error: string,
  intentos: number,
) {
  const maxIntentos = 5;

  const reintentar = intentos < maxIntentos;

  const minutosEspera = Math.min(2 ** intentos, 60);

  return prisma.envioEmail.update({
    where: { id },
    data: {
      estado: reintentar ? 'PENDIENTE' : 'FALLIDO',
      ultimoError: error,
      proximoIntento: reintentar
        ? new Date(Date.now() + minutosEspera * 60_000)
        : null,
      fechaInicioEnvio: null,
    },
  });
}

export function recoverStuckEmails() {
  const limite = new Date(Date.now() - 15 * 60_000);

  return prisma.envioEmail.updateMany({
    where: {
      estado: 'ENVIANDO',
      fechaInicioEnvio: { lt: limite },
      intentos: { lt: 5 },
    },
    data: {
      estado: 'PENDIENTE',
      fechaInicioEnvio: null,
      proximoIntento: null,
    },
  });
}

export function markStuckEmailsForReview() {
  const limite = new Date(Date.now() - 15 * 60_000);

  return prisma.envioEmail.updateMany({
    where: {
      estado: 'ENVIANDO',
      fechaInicioEnvio: { lt: limite },
      intentos: { gte: 5 },
    },
    data: {
      estado: 'FALLIDO',
      ultimoError:
        'Envío interrumpido. Resultado incierto. Requiere revisión manual.',
      fechaInicioEnvio: null,
      proximoIntento: null,
    },
  });
}
