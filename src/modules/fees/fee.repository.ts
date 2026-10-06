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

export async function findFeeConfigurationById(id: number) {
  return prisma.configuracionCuota.findUnique({
    where: { id },
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

export async function updateFeeAmounts(
  cuotaId: number,
  importeAjustes: number,
  importeTotal: number,
) {
  return prisma.cuota.update({
    where: {
      id: cuotaId,
    },
    data: {
      importeAjustes,
      importeTotal,
    },
  });
}

export async function findMemberFeeAdjustments(socioId: number) {
  return prisma.ajusteCuotaSocio.findMany({
    where: {
      socioId,
      activo: true,
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
      pagos: {
        where: {
          pago: {
            anulado: false,
          },
        },
      },
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
    comprobanteUrl,
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
        comprobanteUrl,
        observaciones,
      },
    });

    const cashCategory = await tx.categoriaCaja.findUnique({
      where: {
        nombre_tipo: {
          nombre: 'Cuotas de socios',
          tipo: 'INGRESO',
        },
      },
    });

    if (!cashCategory) {
      throw new Error('No existe la categoría de caja para cuotas de socios');
    }

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

    await tx.movimientoCaja.create({
      data: {
        tipo: 'INGRESO',
        categoriaId: cashCategory.id,
        concepto: `Pago de cuotas - Socio #${socioId}`,
        importe,
        fecha: fechaPago,
        observaciones,
        registradoPorId,
        pagoCuotaId: payment.id,
      },
    });

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

export async function cancelFeePayment(
  pagoId: number,
  anuladoPorId: number,
  motivoAnulacion: string,
) {
  return prisma.$transaction(async (tx) => {
    const payment = await tx.pagoCuota.findUnique({
      where: {
        id: pagoId,
      },
      include: {
        detalles: true,
        movimientoCaja: true,
      },
    });

    if (!payment) {
      throw new Error('El pago no existe');
    }

    if (payment.anulado) {
      throw new Error('El pago ya está anulado');
    }

    const affectedFeeIds = payment.detalles.map((detail) => detail.cuotaId);

    const cancellationDate = new Date();

    // Anulamos el pago, pero conservamos todo su historial.
    await tx.pagoCuota.update({
      where: {
        id: pagoId,
      },
      data: {
        anulado: true,
        fechaAnulacion: cancellationDate,
        anuladoPorId,
        motivoAnulacion,
      },
    });

    // El ingreso de caja generado por este pago también deja de ser válido.
    // No se elimina: queda registrado como anulado.
    if (payment.movimientoCaja) {
      await tx.movimientoCaja.update({
        where: {
          id: payment.movimientoCaja.id,
        },
        data: {
          anulado: true,
          fechaAnulacion: cancellationDate,
          anuladoPorId,
          motivoAnulacion,
        },
      });
    }

    // Recalculamos el estado de todas las cuotas afectadas.
    for (const cuotaId of affectedFeeIds) {
      const fee = await tx.cuota.findUnique({
        where: {
          id: cuotaId,
        },
        include: {
          pagos: {
            where: {
              pago: {
                anulado: false,
              },
            },
          },
        },
      });

      if (!fee) {
        continue;
      }

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

    return tx.pagoCuota.findUnique({
      where: {
        id: pagoId,
      },
      include: {
        detalles: true,
        movimientoCaja: true,
      },
    });
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
      anuladoPor: {
        select: {
          id: true,
          email: true,
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
      pagos: {
        where: {
          pago: {
            anulado: false,
          },
        },
      },
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
      anulado: false,
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

export async function getRecentPayments(limit: number = 5) {
  return prisma.pagoCuota.findMany({
    where: {
      anulado: false,
    },
    orderBy: {
      fechaPago: 'desc',
    },
    take: limit,
    include: {
      socio: {
        select: {
          razonSocial: true,
        },
      },
    },
  });
}

export async function findConfigurationByEffectiveDate(vigenciaDesde: Date) {
  return prisma.configuracionCuota.findUnique({
    where: { vigenciaDesde },
  });
}

export async function updateFeeConfiguration(id: number, importeBase: number) {
  return prisma.configuracionCuota.update({
    where: { id },
    data: { importeBase },
  });
}

export async function findFeeAdjustmentById(id: number) {
  return prisma.ajusteCuotaSocio.findUnique({
    where: { id },
  });
}

export async function deactivateFeeAdjustment(id: number) {
  return prisma.ajusteCuotaSocio.update({
    where: { id },
    data: {
      activo: false,
    },
  });
}
