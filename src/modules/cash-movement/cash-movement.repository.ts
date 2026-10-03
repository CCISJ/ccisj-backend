import { prisma } from '@/config/prisma';
import {
  CashMovementFilters,
  CreateManualCashMovementData,
} from '@/types/cash-movement.type';

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

export async function findCashMovements(filters: CashMovementFilters = {}) {
  return prisma.movimientoCaja.findMany({
    where: {
      fecha: {
        gte: filters.desde,
        lte: filters.hasta,
      },
      tipo: filters.tipo,
      categoriaId: filters.categoriaId,
      concepto: filters.buscar
        ? {
            contains: filters.buscar,
            mode: 'insensitive',
          }
        : undefined,
    },
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

export async function getCashSummary(startDate: Date, endDate: Date) {
  return prisma.movimientoCaja.groupBy({
    by: ['tipo'],
    where: {
      fecha: {
        gte: startDate,
        lt: endDate,
      },
    },
    _sum: {
      importe: true,
    },
    _count: {
      id: true,
    },
  });
}
