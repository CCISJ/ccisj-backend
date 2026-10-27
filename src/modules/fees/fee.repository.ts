import { prisma } from '@/config/prisma';
import {
  CreateFeeAdjustmentData,
  CreateFeeData,
  CreateFeePaymentData,
} from '@/types/fee.type';

type TransactionClient = Parameters<
  Parameters<typeof prisma.$transaction>[0]
>[0];

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

/**
 * El comprobante de un pago vive en su movimiento de caja: con esto el pago
 * dice si tiene uno y con qué movimiento pedirlo
 * (`GET /caja/movimientos/:id/comprobante`).
 */
const PAYMENT_CASH_MOVEMENT = {
  select: {
    id: true,
    comprobanteUrl: true,
  },
} as const;

async function lockMemberForPayment(tx: TransactionClient, socioId: number) {
  await tx.$queryRaw`
    SELECT id
    FROM "Socio"
    WHERE id = ${socioId}
    FOR UPDATE
  `;
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
  } = data;

  return prisma.$transaction(async (tx) => {
    // Bloqueamos al socio para evitar pagos concurrentes.
    await lockMemberForPayment(tx, socioId);

    // Consultamos las cuotas dentro de la transacción.
    const fees = await tx.cuota.findMany({
      where: {
        socioId,
        estado: {
          not: 'ANULADA',
        },
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

    // Calculamos cuánto queda pendiente por cuota.
    const pendingFees = fees
      .map((fee) => {
        const paid = fee.pagos.reduce(
          (total, payment) => total + Number(payment.importeAplicado),
          0,
        );

        return {
          fee,
          balance: Number(fee.importeTotal) - paid,
        };
      })
      .filter(({ balance }) => balance > 0);

    if (pendingFees.length === 0) {
      throw new Error('El socio no tiene cuotas pendientes');
    }

    const totalDebt = pendingFees.reduce(
      (total, { balance }) => total + balance,
      0,
    );

    if (importe > totalDebt) {
      throw new Error(
        'El importe del pago no puede superar la deuda pendiente',
      );
    }

    // Distribuimos el pago entre las cuotas más antiguas.
    let remaining = importe;

    const detalles: {
      cuotaId: number;
      importeAplicado: number;
      estadoResultante: 'PARCIAL' | 'PAGADA';
    }[] = [];

    for (const { fee, balance } of pendingFees) {
      if (remaining <= 0) break;

      const applied = Math.min(remaining, balance);
      const newBalance = balance - applied;

      detalles.push({
        cuotaId: fee.id,
        importeAplicado: applied,
        estadoResultante: newBalance <= 0 ? 'PAGADA' : 'PARCIAL',
      });

      remaining -= applied;
    }

    // Creamos el pago.
    const payment = await tx.pagoCuota.create({
      data: {
        socioId,
        registradoPorId,
        importe,
        fechaPago,
        medioPago,
        observaciones,
      },
    });

    // Buscamos la categoría de caja correspondiente.
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

    // Registramos la distribución del pago.
    await tx.pagoCuotaDetalle.createMany({
      data: detalles.map((detail) => ({
        pagoId: payment.id,
        cuotaId: detail.cuotaId,
        importeAplicado: detail.importeAplicado,
      })),
    });

    // Actualizamos los estados de las cuotas afectadas.
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

    // Registramos el ingreso en caja.
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
        comprobanteUrl,
      },
    });

    // Devolvemos el pago con sus detalles y comprobante.
    return tx.pagoCuota.findUnique({
      where: {
        id: payment.id,
      },
      include: {
        detalles: true,
        movimientoCaja: PAYMENT_CASH_MOVEMENT,
      },
    });
  });
}

export async function cancelFeePayment(
  pagoId: number,
  anuladoPorId: number,
  motivoAnulacion: string,
) {
  // Solo obtenemos el socio al que pertenece el pago.
  const paymentOwner = await prisma.pagoCuota.findUnique({
    where: { id: pagoId },
    select: { socioId: true },
  });

  if (!paymentOwner) {
    throw new Error('El pago no existe');
  }

  return prisma.$transaction(async (tx) => {
    // Mismo bloqueo utilizado al registrar pagos.
    await lockMemberForPayment(tx, paymentOwner.socioId);

    // Consultamos nuevamente el pago dentro de la transacción.
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

    const affectedFeeIds = [
      ...new Set(payment.detalles.map((detail) => detail.cuotaId)),
    ];

    const cancellationDate = new Date();

    // Anulamos el pago conservando su historial.
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

    // Anulamos también el movimiento de caja asociado.
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

    // Recalculamos las cuotas afectadas usando los pagos no anulados.
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
      movimientoCaja: PAYMENT_CASH_MOVEMENT,
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

export async function lockMemberFees(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  socioId: number,
) {
  await tx.$queryRaw`
    SELECT id
    FROM socio
    WHERE id = ${socioId}
    FOR UPDATE
  `;
}

async function recalculateAdjustedFees(
  tx: TransactionClient,
  socioId: number,
  fechaDesde: Date,
  fechaHasta: Date | null,
) {
  const fees = await tx.cuota.findMany({
    where: {
      socioId,
      estado: { in: ['PENDIENTE', 'PARCIAL'] },
      periodoHasta: { gte: fechaDesde },
      ...(fechaHasta ? { periodoDesde: { lte: fechaHasta } } : {}),
    },
    include: {
      pagos: {
        where: { pago: { anulado: false } },
      },
    },
  });

  for (const fee of fees) {
    const adjustments = await tx.ajusteCuotaSocio.findMany({
      where: {
        socioId,
        activo: true,
        fechaDesde: { lte: fee.periodoHasta },
        OR: [{ fechaHasta: null }, { fechaHasta: { gte: fee.periodoDesde } }],
      },
    });

    const importeAjustes = adjustments.reduce(
      (total, adjustment) =>
        total +
        (adjustment.tipo === 'ADICIONAL' ? 1 : -1) * Number(adjustment.importe),
      0,
    );

    const importeTotal = Number(fee.importeBase) + importeAjustes;

    if (importeTotal < 0) {
      throw new Error(
        'Los ajustes no pueden generar una cuota con importe negativo',
      );
    }

    const totalPaid = fee.pagos.reduce(
      (total, payment) => total + Number(payment.importeAplicado),
      0,
    );

    if (importeTotal < totalPaid) {
      throw new Error(
        'Los ajustes no pueden dejar una cuota por debajo del importe ya pagado',
      );
    }

    await tx.cuota.update({
      where: { id: fee.id },
      data: {
        importeAjustes,
        importeTotal,
        estado:
          totalPaid === 0
            ? 'PENDIENTE'
            : totalPaid >= importeTotal
              ? 'PAGADA'
              : 'PARCIAL',
      },
    });
  }
}

export async function createFeeAdjustmentWithRecalculation(
  data: CreateFeeAdjustmentData,
) {
  return prisma.$transaction(async (tx) => {
    await lockMemberForPayment(tx, data.socioId);

    const adjustment = await tx.ajusteCuotaSocio.create({ data });

    await recalculateAdjustedFees(
      tx,
      data.socioId,
      data.fechaDesde,
      data.fechaHasta ?? null,
    );

    return adjustment;
  });
}

export async function deactivateFeeAdjustmentWithRecalculation(
  adjustmentId: number,
) {
  return prisma.$transaction(async (tx) => {
    const adjustmentInfo = await tx.ajusteCuotaSocio.findUnique({
      where: { id: adjustmentId },
      select: { socioId: true },
    });

    if (!adjustmentInfo) {
      throw new Error('El ajuste no existe');
    }

    await lockMemberForPayment(tx, adjustmentInfo.socioId);

    const adjustment = await tx.ajusteCuotaSocio.findUnique({
      where: { id: adjustmentId },
    });

    if (!adjustment || !adjustment.activo) {
      throw new Error('El ajuste ya está inactivo');
    }

    const paidFees = await tx.cuota.count({
      where: {
        socioId: adjustment.socioId,
        estado: 'PAGADA',
        periodoHasta: { gte: adjustment.fechaDesde },
        ...(adjustment.fechaHasta
          ? { periodoDesde: { lte: adjustment.fechaHasta } }
          : {}),
      },
    });

    await tx.ajusteCuotaSocio.update({
      where: { id: adjustmentId },
      data: { activo: false },
    });

    await recalculateAdjustedFees(
      tx,
      adjustment.socioId,
      adjustment.fechaDesde,
      adjustment.fechaHasta,
    );

    return {
      id: adjustmentId,
      activo: false,
      cuotasPagadasNoModificadas: paidFees,
    };
  });
}
