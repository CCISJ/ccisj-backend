import { prisma } from '@/config/prisma';
import {
  CreateFeeAdjustmentData,
  CreateFeeData,
  CreateFeePaymentData,
} from '@/types/fee.type';

export async function findCurrentFeeConfiguration() {
  return prisma.configuracionCuota.findFirst({
    where: {
      vigenciaDesde: {
        lte: new Date(),
      },
    },
    orderBy: {
      vigenciaDesde: 'desc',
    },
  });
}

export async function findFeeConfigurationHistory() {
  return prisma.configuracionCuota.findMany({
    orderBy: {
      vigenciaDesde: 'desc',
    },
  });
}

export async function createFeeConfiguration(
  importeBase: number,
  vigenciaDesde: Date,
) {
  return prisma.configuracionCuota.create({
    data: {
      importeBase,
      vigenciaDesde,
    },
  });
}

export async function findFeeByMemberAndPeriod(
  socioId: number,
  periodoDesde: Date,
) {
  return prisma.cuota.findFirst({
    where: {
      socioId,
      periodoDesde,
    },
  });
}

export async function findMemberFees(socioId: number) {
  return prisma.cuota.findMany({
    where: {
      socioId,
    },
    orderBy: {
      periodoDesde: 'desc',
    },
  });
}

export async function findActiveFeeAdjustments(
  socioId: number,
  periodoDesde: Date,
  periodoHasta: Date,
) {
  return prisma.ajusteCuotaSocio.findMany({
    where: {
      socioId,
      activo: true,
      fechaDesde: {
        lte: periodoHasta,
      },
      OR: [
        {
          fechaHasta: null,
        },
        {
          fechaHasta: {
            gte: periodoDesde,
          },
        },
      ],
    },
  });
}

export async function findFeeConfigurationForDate(fecha: Date) {
  return prisma.configuracionCuota.findFirst({
    where: {
      vigenciaDesde: {
        lte: fecha,
      },
    },
    orderBy: {
      vigenciaDesde: 'desc',
    },
  });
}

export async function createFee(data: CreateFeeData) {
  return prisma.cuota.create({
    data,
  });
}

export async function createFeeAdjustment(data: CreateFeeAdjustmentData) {
  return prisma.ajusteCuotaSocio.create({
    data,
  });
}

export async function findMemberFeeAdjustments(socioId: number) {
  return prisma.ajusteCuotaSocio.findMany({
    where: {
      socioId,
    },
    orderBy: {
      fechaDesde: 'desc',
    },
  });
}

export async function findMemberFeesWithPayments(socioId: number) {
  return prisma.cuota.findMany({
    where: {
      socioId,
    },
    include: {
      pagos: true,
    },
    orderBy: {
      periodoDesde: 'asc',
    },
  });
}

export async function createFeePayment(data: CreateFeePaymentData) {
  const {
    socioId,
    registradoPorId,
    importe,
    fechaPago,
    medioPago,
    numeroRecibo,
    observaciones,
    detalles,
  } = data;

  return prisma.$transaction(async (tx) => {
    const payment = await tx.pagoCuota.create({
      data: {
        socioId,
        registradoPorId,
        importe,
        fechaPago,
        medioPago,
        numeroRecibo,
        observaciones,
      },
    });

    await tx.pagoCuotaDetalle.createMany({
      data: detalles.map((detail) => ({
        pagoId: payment.id,
        cuotaId: detail.cuotaId,
        importeAplicado: detail.importeAplicado,
      })),
    });

    for (const detail of detalles) {
      await tx.cuota.update({
        where: {
          id: detail.cuotaId,
        },
        data: {
          estado: detail.estadoResultante,
        },
      });
    }

    return tx.pagoCuota.findUnique({
      where: {
        id: payment.id,
      },
      include: {
        detalles: true,
      },
    });
  });
}

export async function deleteFeePayment(pagoId: number) {
  return prisma.$transaction(async (tx) => {
    const payment = await tx.pagoCuota.findUnique({
      where: {
        id: pagoId,
      },
      include: {
        detalles: true,
      },
    });

    if (!payment) {
      throw new Error('El pago no existe');
    }

    const affectedFeeIds = payment.detalles.map((detail) => detail.cuotaId);

    await tx.pagoCuota.delete({
      where: {
        id: pagoId,
      },
    });

    for (const cuotaId of affectedFeeIds) {
      const fee = await tx.cuota.findUnique({
        where: {
          id: cuotaId,
        },
        include: {
          pagos: true,
        },
      });

      if (!fee) continue;

      const totalPaid = fee.pagos.reduce(
        (total, detail) => total + Number(detail.importeAplicado),
        0,
      );

      const total = Number(fee.importeTotal);

      let estado: 'PENDIENTE' | 'PARCIAL' | 'PAGADA';

      if (totalPaid <= 0) {
        estado = 'PENDIENTE';
      } else if (totalPaid >= total) {
        estado = 'PAGADA';
      } else {
        estado = 'PARCIAL';
      }

      await tx.cuota.update({
        where: {
          id: cuotaId,
        },
        data: {
          estado,
        },
      });
    }

    return payment;
  });
}

export async function findMemberFeePayments(socioId: number) {
  return prisma.pagoCuota.findMany({
    where: {
      socioId,
    },
    include: {
      detalles: {
        include: {
          cuota: true,
        },
      },
    },
    orderBy: {
      fechaPago: 'desc',
    },
  });
}

export async function findAllFeesWithPayments() {
  return prisma.cuota.findMany({
    include: {
      pagos: true,
      socio: {
        select: {
          id: true,
          usuario: {
            select: {
              activo: true,
            },
          },
        },
      },
    },
    orderBy: {
      periodoDesde: 'asc',
    },
  });
}

export async function findPaymentsByDateRange(
  fechaDesde: Date,
  fechaHasta: Date,
) {
  return prisma.pagoCuota.findMany({
    where: {
      fechaPago: {
        gte: fechaDesde,
        lt: fechaHasta,
      },
    },
    orderBy: {
      fechaPago: 'desc',
    },
  });
}
