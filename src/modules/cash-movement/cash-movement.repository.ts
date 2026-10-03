import { prisma } from '@/config/prisma';
import { CreateManualCashMovementData } from '@/types/cash-movement.type';

export async function createCashMovement(data: CreateManualCashMovementData) {
  return prisma.movimientoCaja.create({
    data,
    include: {
      categoria: true,
      registradoPor: {
        select: {
          id: true,
          email: true,
          tipo: true,
        },
      },
    },
  });
}

export async function findCashMovementById(id: number) {
  return prisma.movimientoCaja.findUnique({
    where: { id },
    include: {
      categoria: true,
      registradoPor: {
        select: {
          id: true,
          email: true,
          tipo: true,
        },
      },
      pagoCuota: {
        include: {
          socio: {
            select: {
              id: true,
              razonSocial: true,
            },
          },
        },
      },
    },
  });
}

export async function findCashMovements() {
  return prisma.movimientoCaja.findMany({
    orderBy: [{ fecha: 'desc' }, { fechaCreacion: 'desc' }],
    include: {
      categoria: true,
      registradoPor: {
        select: {
          id: true,
          email: true,
          tipo: true,
        },
      },
      pagoCuota: {
        include: {
          socio: {
            select: {
              id: true,
              razonSocial: true,
            },
          },
        },
      },
    },
  });
}
