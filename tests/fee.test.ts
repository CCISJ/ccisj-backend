import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import app from '../src/app';
import { prisma } from '../src/config/prisma';
import {
  cancelMemberFeePayment,
  generateMonthlyFee,
  generateMonthlyFees,
  getFeesDashboardSummary,
  getMemberFeeStatus,
  registerFeePayment,
  removeFeeAdjustment,
} from '../src/modules/fees/fee.service';
import {
  createAdmin,
  createApplicant,
  createMember,
  deleteMemberPayments,
  deleteUsers,
} from './session';

describe('Cuotas', () => {
  let firstMember: Awaited<ReturnType<typeof createMember>>;
  let secondMember: Awaited<ReturnType<typeof createMember>>;
  let inactiveMember: Awaited<ReturnType<typeof createMember>>;

  const year = 2026;
  const month = 9;
  const periodoDesde = new Date(Date.UTC(year, month - 1, 1));

  beforeAll(async () => {
    firstMember = await createMember();
    secondMember = await createMember();
    inactiveMember = await createMember();

    await prisma.usuario.update({
      where: {
        id: inactiveMember.userId,
      },
      data: {
        activo: false,
      },
    });

    await prisma.cuota.deleteMany({
      where: {
        socioId: {
          in: [
            firstMember.socioId,
            secondMember.socioId,
            inactiveMember.socioId,
          ],
        },
        periodoDesde,
      },
    });
  });

  afterAll(async () => {
    await deleteMemberPayments([
      firstMember.socioId,
      secondMember.socioId,
      inactiveMember.socioId,
    ]);

    await prisma.cuota.deleteMany({
      where: {
        socioId: {
          in: [
            firstMember.socioId,
            secondMember.socioId,
            inactiveMember.socioId,
          ],
        },
      },
    });

    await deleteUsers([
      firstMember.userId,
      secondMember.userId,
      inactiveMember.userId,
    ]);

    await prisma.$disconnect();
  });

  it('genera una cuota mensual con el importe vigente', async () => {
    const fee = await generateMonthlyFee(firstMember.socioId, year, month);

    expect(fee.socioId).toBe(firstMember.socioId);

    expect(Number(fee.importeBase)).toBe(760);
    expect(Number(fee.importeAjustes)).toBe(0);
    expect(Number(fee.importeTotal)).toBe(760);

    expect(fee.estado).toBe('PENDIENTE');

    expect(fee.periodoDesde.toISOString().slice(0, 10)).toBe('2026-09-01');

    expect(fee.periodoHasta.toISOString().slice(0, 10)).toBe('2026-09-30');

    expect(fee.fechaVencimiento.toISOString().slice(0, 10)).toBe('2026-09-30');
  });

  it('no permite generar dos cuotas para el mismo socio y período', async () => {
    await expect(
      generateMonthlyFee(firstMember.socioId, year, month),
    ).rejects.toThrow('Ya existe una cuota para ese socio y período');

    const fees = await prisma.cuota.count({
      where: {
        socioId: firstMember.socioId,
        periodoDesde,
      },
    });

    expect(fees).toBe(1);
  });

  it('la generación masiva genera cuotas para socios activos', async () => {
    const result = await generateMonthlyFees(year, month);

    expect(result.generated).toBeGreaterThanOrEqual(1);

    const secondFee = await prisma.cuota.findUnique({
      where: {
        socioId_periodoDesde: {
          socioId: secondMember.socioId,
          periodoDesde,
        },
      },
    });

    expect(secondFee).not.toBeNull();
    expect(Number(secondFee!.importeTotal)).toBe(760);
  });

  it('la generación masiva no genera cuotas para socios inactivos', async () => {
    const fee = await prisma.cuota.findUnique({
      where: {
        socioId_periodoDesde: {
          socioId: inactiveMember.socioId,
          periodoDesde,
        },
      },
    });

    expect(fee).toBeNull();
  });

  it('repetir la generación masiva no duplica cuotas', async () => {
    await generateMonthlyFees(year, month);

    const firstCount = await prisma.cuota.count({
      where: {
        socioId: firstMember.socioId,
        periodoDesde,
      },
    });

    const secondCount = await prisma.cuota.count({
      where: {
        socioId: secondMember.socioId,
        periodoDesde,
      },
    });

    expect(firstCount).toBe(1);
    expect(secondCount).toBe(1);
  });

  it('aplica adicionales y descuentos al generar una cuota', async () => {
    const member = await createMember();

    try {
      await prisma.ajusteCuotaSocio.createMany({
        data: [
          {
            socioId: member.socioId,
            tipo: 'ADICIONAL',
            importe: 100,
            fechaDesde: new Date('2026-10-01'),
            fechaHasta: new Date('2026-10-31'),
            motivo: 'Adicional de prueba',
          },
          {
            socioId: member.socioId,
            tipo: 'DESCUENTO',
            importe: 50,
            fechaDesde: new Date('2026-10-01'),
            fechaHasta: new Date('2026-10-31'),
            motivo: 'Descuento de prueba',
          },
        ],
      });

      const fee = await generateMonthlyFee(member.socioId, 2026, 10);

      expect(Number(fee.importeBase)).toBe(760);
      expect(Number(fee.importeAjustes)).toBe(50);
      expect(Number(fee.importeTotal)).toBe(810);
    } finally {
      await deleteMemberPayments([member.socioId]);

      await prisma.cuota.deleteMany({
        where: {
          socioId: member.socioId,
        },
      });

      await prisma.ajusteCuotaSocio.deleteMany({
        where: {
          socioId: member.socioId,
        },
      });

      await deleteUsers([member.userId]);
    }
  });

  it('no aplica un ajuste fuera de su período', async () => {
    const member = await createMember();

    try {
      await prisma.ajusteCuotaSocio.create({
        data: {
          socioId: member.socioId,
          tipo: 'DESCUENTO',
          importe: 100,
          fechaDesde: new Date('2026-10-01'),
          fechaHasta: new Date('2026-10-31'),
          motivo: 'Descuento de octubre',
        },
      });

      const fee = await generateMonthlyFee(member.socioId, 2026, 11);

      expect(Number(fee.importeBase)).toBe(760);
      expect(Number(fee.importeAjustes)).toBe(0);
      expect(Number(fee.importeTotal)).toBe(760);
    } finally {
      await deleteMemberPayments([member.socioId]);

      await prisma.cuota.deleteMany({
        where: {
          socioId: member.socioId,
        },
      });

      await prisma.ajusteCuotaSocio.deleteMany({
        where: {
          socioId: member.socioId,
        },
      });

      await deleteUsers([member.userId]);
    }
  });

  it('aplica un ajuste indefinido en meses posteriores', async () => {
    const member = await createMember();

    try {
      await prisma.ajusteCuotaSocio.create({
        data: {
          socioId: member.socioId,
          tipo: 'DESCUENTO',
          importe: 60,
          fechaDesde: new Date('2026-10-01'),
          fechaHasta: null,
          motivo: 'Descuento permanente',
        },
      });

      const fee = await generateMonthlyFee(member.socioId, 2026, 12);

      expect(Number(fee.importeBase)).toBe(760);
      expect(Number(fee.importeAjustes)).toBe(-60);
      expect(Number(fee.importeTotal)).toBe(700);
    } finally {
      await deleteMemberPayments([member.socioId]);

      await prisma.cuota.deleteMany({
        where: {
          socioId: member.socioId,
        },
      });

      await prisma.ajusteCuotaSocio.deleteMany({
        where: {
          socioId: member.socioId,
        },
      });

      await deleteUsers([member.userId]);
    }
  });

  it('no permite que los ajustes generen una cuota negativa', async () => {
    const member = await createMember();

    try {
      await prisma.ajusteCuotaSocio.create({
        data: {
          socioId: member.socioId,
          tipo: 'DESCUENTO',
          importe: 1000,
          fechaDesde: new Date('2026-10-01'),
          fechaHasta: new Date('2026-10-31'),
        },
      });

      await expect(
        generateMonthlyFee(member.socioId, 2026, 10),
      ).rejects.toThrow(
        'Los ajustes no pueden generar una cuota con importe negativo',
      );

      const fee = await prisma.cuota.findFirst({
        where: {
          socioId: member.socioId,
          periodoDesde: new Date(Date.UTC(2026, 9, 1)),
        },
      });

      expect(fee).toBeNull();
    } finally {
      await deleteMemberPayments([member.socioId]);

      await prisma.cuota.deleteMany({
        where: {
          socioId: member.socioId,
        },
      });

      await prisma.ajusteCuotaSocio.deleteMany({
        where: {
          socioId: member.socioId,
        },
      });

      await deleteUsers([member.userId]);
    }
  });

  it('registra un pago completo de una cuota', async () => {
    const member = await createMember();

    try {
      const fee = await generateMonthlyFee(member.socioId, 2026, 7);

      const payment = await registerFeePayment({
        socioId: member.socioId,
        registradoPorId: member.userId,
        importe: 760,
        fechaPago: new Date('2026-07-15'),
        medioPago: 'EFECTIVO',
        comprobanteUrl: 'https://comprobantes.test/TEST-001.pdf',
      });

      expect(payment).not.toBeNull();
      expect(Number(payment!.importe)).toBe(760);
      expect(payment!.detalles).toHaveLength(1);

      expect(Number(payment!.detalles[0].importeAplicado)).toBe(760);

      const updatedFee = await prisma.cuota.findUnique({
        where: {
          id: fee.id,
        },
      });

      expect(updatedFee?.estado).toBe('PAGADA');
    } finally {
      await deleteMemberPayments([member.socioId]);

      await prisma.cuota.deleteMany({
        where: {
          socioId: member.socioId,
        },
      });

      await deleteUsers([member.userId]);
    }
  });

  it('permite realizar un pago parcial', async () => {
    const member = await createMember();

    try {
      const fee = await generateMonthlyFee(member.socioId, 2026, 7);

      const payment = await registerFeePayment({
        socioId: member.socioId,
        registradoPorId: member.userId,
        importe: 300,
        fechaPago: new Date('2026-07-15'),
        medioPago: 'EFECTIVO',
      });

      expect(payment).not.toBeNull();
      expect(payment!.detalles).toHaveLength(1);

      expect(Number(payment!.detalles[0].importeAplicado)).toBe(300);

      const updatedFee = await prisma.cuota.findUnique({
        where: {
          id: fee.id,
        },
      });

      expect(updatedFee?.estado).toBe('PARCIAL');
    } finally {
      await deleteMemberPayments([member.socioId]);

      await prisma.cuota.deleteMany({
        where: {
          socioId: member.socioId,
        },
      });

      await deleteUsers([member.userId]);
    }
  });

  it('distribuye un pago entre varias cuotas empezando por la más antigua', async () => {
    const member = await createMember();

    try {
      const julyFee = await generateMonthlyFee(member.socioId, 2026, 7);

      const augustFee = await generateMonthlyFee(member.socioId, 2026, 8);

      const septemberFee = await generateMonthlyFee(member.socioId, 2026, 9);

      const payment = await registerFeePayment({
        socioId: member.socioId,
        registradoPorId: member.userId,
        importe: 1000,
        fechaPago: new Date('2026-09-18'),
        medioPago: 'TRANSFERENCIA',
        comprobanteUrl: 'https://comprobantes.test/TEST-002.pdf',
      });

      expect(payment).not.toBeNull();
      expect(payment!.detalles).toHaveLength(2);

      expect(payment!.detalles[0].cuotaId).toBe(julyFee.id);

      expect(Number(payment!.detalles[0].importeAplicado)).toBe(760);

      expect(payment!.detalles[1].cuotaId).toBe(augustFee.id);

      expect(Number(payment!.detalles[1].importeAplicado)).toBe(240);

      const fees = await prisma.cuota.findMany({
        where: {
          id: {
            in: [julyFee.id, augustFee.id, septemberFee.id],
          },
        },
        orderBy: {
          periodoDesde: 'asc',
        },
      });

      expect(fees[0].estado).toBe('PAGADA');
      expect(fees[1].estado).toBe('PARCIAL');
      expect(fees[2].estado).toBe('PENDIENTE');
    } finally {
      await deleteMemberPayments([member.socioId]);

      await prisma.cuota.deleteMany({
        where: {
          socioId: member.socioId,
        },
      });

      await deleteUsers([member.userId]);
    }
  });

  it('continúa pagando el saldo restante de una cuota parcial', async () => {
    const member = await createMember();

    try {
      const fee = await generateMonthlyFee(member.socioId, 2026, 7);

      await registerFeePayment({
        socioId: member.socioId,
        registradoPorId: member.userId,
        importe: 300,
        fechaPago: new Date('2026-07-10'),
        medioPago: 'EFECTIVO',
      });

      await registerFeePayment({
        socioId: member.socioId,
        registradoPorId: member.userId,
        importe: 460,
        fechaPago: new Date('2026-07-20'),
        medioPago: 'EFECTIVO',
      });

      const updatedFee = await prisma.cuota.findUnique({
        where: {
          id: fee.id,
        },
        include: {
          pagos: true,
        },
      });

      expect(updatedFee?.estado).toBe('PAGADA');
      expect(updatedFee?.pagos).toHaveLength(2);

      const totalPaid =
        updatedFee?.pagos.reduce(
          (total, detail) => total + Number(detail.importeAplicado),
          0,
        ) ?? 0;

      expect(totalPaid).toBe(760);
    } finally {
      await deleteMemberPayments([member.socioId]);

      await prisma.cuota.deleteMany({
        where: {
          socioId: member.socioId,
        },
      });

      await deleteUsers([member.userId]);
    }
  });

  it('no permite pagar más que la deuda pendiente', async () => {
    const member = await createMember();

    try {
      await generateMonthlyFee(member.socioId, 2026, 7);

      await expect(
        registerFeePayment({
          socioId: member.socioId,
          registradoPorId: member.userId,
          importe: 1000,
          fechaPago: new Date('2026-07-15'),
          medioPago: 'EFECTIVO',
        }),
      ).rejects.toThrow(
        'El importe del pago no puede superar la deuda pendiente',
      );

      const payments = await prisma.pagoCuota.count({
        where: {
          socioId: member.socioId,
        },
      });

      expect(payments).toBe(0);
    } finally {
      await deleteMemberPayments([member.socioId]);

      await prisma.cuota.deleteMany({
        where: {
          socioId: member.socioId,
        },
      });

      await deleteUsers([member.userId]);
    }
  });

  it('anula un pago y vuelve la cuota a pendiente', async () => {
    const member = await createMember();
    const admin = await createAdmin();

    try {
      const fee = await generateMonthlyFee(member.socioId, 2026, 7);

      const payment = await registerFeePayment({
        socioId: member.socioId,
        registradoPorId: admin.userId,
        importe: 760,
        fechaPago: new Date('2026-07-15'),
        medioPago: 'EFECTIVO',
        comprobanteUrl: 'https://comprobantes.test/TEST-CANCEL-001.pdf',
      });

      expect(payment).not.toBeNull();

      const paidFee = await prisma.cuota.findUnique({
        where: {
          id: fee.id,
        },
      });

      expect(paidFee?.estado).toBe('PAGADA');

      const movement = await prisma.movimientoCaja.findUnique({
        where: {
          pagoCuotaId: payment!.id,
        },
      });

      expect(movement).not.toBeNull();
      expect(movement?.anulado).toBe(false);

      await cancelMemberFeePayment(
        payment!.id,
        admin.userId,
        'Pago registrado por error',
      );

      const cancelledPayment = await prisma.pagoCuota.findUnique({
        where: {
          id: payment!.id,
        },
      });

      expect(cancelledPayment).not.toBeNull();
      expect(cancelledPayment?.anulado).toBe(true);
      expect(cancelledPayment?.anuladoPorId).toBe(admin.userId);
      expect(cancelledPayment?.motivoAnulacion).toBe(
        'Pago registrado por error',
      );
      expect(cancelledPayment?.fechaAnulacion).not.toBeNull();

      const cancelledMovement = await prisma.movimientoCaja.findUnique({
        where: {
          pagoCuotaId: payment!.id,
        },
      });

      expect(cancelledMovement).not.toBeNull();
      expect(cancelledMovement?.anulado).toBe(true);
      expect(cancelledMovement?.anuladoPorId).toBe(admin.userId);
      expect(cancelledMovement?.motivoAnulacion).toBe(
        'Pago registrado por error',
      );
      expect(cancelledMovement?.fechaAnulacion).not.toBeNull();

      const recalculatedFee = await prisma.cuota.findUnique({
        where: {
          id: fee.id,
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

      expect(recalculatedFee?.estado).toBe('PENDIENTE');
      expect(recalculatedFee?.pagos).toHaveLength(0);
    } finally {
      await deleteMemberPayments([member.socioId]);

      await prisma.cuota.deleteMany({
        where: {
          socioId: member.socioId,
        },
      });

      await deleteUsers([member.userId, admin.userId]);
    }
  });

  it('al anular un pago recalcula la cuota teniendo en cuenta otros pagos válidos', async () => {
    const member = await createMember();
    const admin = await createAdmin();

    try {
      const fee = await generateMonthlyFee(member.socioId, 2026, 7);

      const firstPayment = await registerFeePayment({
        socioId: member.socioId,
        registradoPorId: admin.userId,
        importe: 300,
        fechaPago: new Date('2026-07-10'),
        medioPago: 'EFECTIVO',
        comprobanteUrl: 'https://comprobantes.test/TEST-CANCEL-002.pdf',
      });

      const secondPayment = await registerFeePayment({
        socioId: member.socioId,
        registradoPorId: admin.userId,
        importe: 460,
        fechaPago: new Date('2026-07-20'),
        medioPago: 'EFECTIVO',
        comprobanteUrl: 'https://comprobantes.test/TEST-CANCEL-003.pdf',
      });

      expect(firstPayment).not.toBeNull();
      expect(secondPayment).not.toBeNull();

      const paidFee = await prisma.cuota.findUnique({
        where: {
          id: fee.id,
        },
      });

      expect(paidFee?.estado).toBe('PAGADA');

      await cancelMemberFeePayment(
        secondPayment!.id,
        admin.userId,
        'Segundo pago registrado por error',
      );

      const recalculatedFee = await prisma.cuota.findUnique({
        where: {
          id: fee.id,
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

      expect(recalculatedFee?.estado).toBe('PARCIAL');
      expect(recalculatedFee?.pagos).toHaveLength(1);

      const totalPaid =
        recalculatedFee?.pagos.reduce(
          (total, detail) => total + Number(detail.importeAplicado),
          0,
        ) ?? 0;

      expect(totalPaid).toBe(300);

      const firstPaymentStored = await prisma.pagoCuota.findUnique({
        where: {
          id: firstPayment!.id,
        },
      });

      const secondPaymentStored = await prisma.pagoCuota.findUnique({
        where: {
          id: secondPayment!.id,
        },
      });

      expect(firstPaymentStored).not.toBeNull();
      expect(firstPaymentStored?.anulado).toBe(false);

      // El segundo pago también sigue existiendo, pero anulado.
      expect(secondPaymentStored).not.toBeNull();
      expect(secondPaymentStored?.anulado).toBe(true);
    } finally {
      await deleteMemberPayments([member.socioId]);

      await prisma.cuota.deleteMany({
        where: {
          socioId: member.socioId,
        },
      });

      await deleteUsers([member.userId, admin.userId]);
    }
  });

  it('no permite anular dos veces el mismo pago', async () => {
    const member = await createMember();
    const admin = await createAdmin();

    try {
      await generateMonthlyFee(member.socioId, 2026, 7);

      const payment = await registerFeePayment({
        socioId: member.socioId,
        registradoPorId: admin.userId,
        importe: 760,
        fechaPago: new Date('2026-07-15'),
        medioPago: 'EFECTIVO',
      });

      expect(payment).not.toBeNull();

      await cancelMemberFeePayment(
        payment!.id,
        admin.userId,
        'Pago registrado por error',
      );

      await expect(
        cancelMemberFeePayment(
          payment!.id,
          admin.userId,
          'Intento de segunda anulación',
        ),
      ).rejects.toThrow('El pago ya está anulado');
    } finally {
      await deleteMemberPayments([member.socioId]);

      await prisma.cuota.deleteMany({
        where: {
          socioId: member.socioId,
        },
      });

      await deleteUsers([member.userId, admin.userId]);
    }
  });

  it('no permite anular un pago sin motivo', async () => {
    const member = await createMember();
    const admin = await createAdmin();

    try {
      await generateMonthlyFee(member.socioId, 2026, 7);

      const payment = await registerFeePayment({
        socioId: member.socioId,
        registradoPorId: admin.userId,
        importe: 760,
        fechaPago: new Date('2026-07-15'),
        medioPago: 'EFECTIVO',
      });

      expect(payment).not.toBeNull();

      await expect(
        cancelMemberFeePayment(payment!.id, admin.userId, '   '),
      ).rejects.toThrow('El motivo de anulación es obligatorio');

      const storedPayment = await prisma.pagoCuota.findUnique({
        where: {
          id: payment!.id,
        },
      });

      expect(storedPayment?.anulado).toBe(false);
    } finally {
      await deleteMemberPayments([member.socioId]);

      await prisma.cuota.deleteMany({
        where: {
          socioId: member.socioId,
        },
      });

      await deleteUsers([member.userId, admin.userId]);
    }
  });
});

it('mantiene al socio al día hasta el día de vencimiento inclusive', async () => {
  const member = await createMember();

  try {
    await generateMonthlyFee(member.socioId, 2026, 9);

    const status = await getMemberFeeStatus(
      member.socioId,
      new Date('2026-09-30T12:00:00Z'),
    );

    expect(status.estado).toBe('AL_DIA');
    expect(status.cuotasVencidas).toBe(0);
    expect(status.deudaVencida).toBe(0);
  } finally {
    await deleteMemberPayments([member.socioId]);

    await prisma.cuota.deleteMany({
      where: { socioId: member.socioId },
    });

    await deleteUsers([member.userId]);
  }
});

it('considera pendiente una cuota desde el día siguiente a su vencimiento', async () => {
  const member = await createMember();

  try {
    await generateMonthlyFee(member.socioId, 2026, 9);

    const status = await getMemberFeeStatus(
      member.socioId,
      new Date('2026-10-01T12:00:00Z'),
    );

    expect(status.estado).toBe('PENDIENTE');
    expect(status.cuotasVencidas).toBe(1);
    expect(status.deudaVencida).toBe(760);
  } finally {
    await deleteMemberPayments([member.socioId]);

    await prisma.cuota.deleteMany({
      where: { socioId: member.socioId },
    });

    await deleteUsers([member.userId]);
  }
});

it('mantiene estado pendiente con dos cuotas vencidas', async () => {
  const member = await createMember();

  try {
    await generateMonthlyFee(member.socioId, 2026, 8);
    await generateMonthlyFee(member.socioId, 2026, 9);

    const status = await getMemberFeeStatus(
      member.socioId,
      new Date('2026-10-01T12:00:00Z'),
    );

    expect(status.estado).toBe('PENDIENTE');
    expect(status.cuotasVencidas).toBe(2);
    expect(status.deudaVencida).toBe(1520);
  } finally {
    await deleteMemberPayments([member.socioId]);

    await prisma.cuota.deleteMany({
      where: { socioId: member.socioId },
    });

    await deleteUsers([member.userId]);
  }
});

it('considera deudor al socio con tres cuotas vencidas', async () => {
  const member = await createMember();

  try {
    await generateMonthlyFee(member.socioId, 2026, 7);
    await generateMonthlyFee(member.socioId, 2026, 8);
    await generateMonthlyFee(member.socioId, 2026, 9);

    const status = await getMemberFeeStatus(
      member.socioId,
      new Date('2026-10-01T12:00:00Z'),
    );

    expect(status.estado).toBe('DEUDOR');
    expect(status.cuotasVencidas).toBe(3);
    expect(status.deudaVencida).toBe(2280);
  } finally {
    await deleteMemberPayments([member.socioId]);

    await prisma.cuota.deleteMany({
      where: { socioId: member.socioId },
    });

    await deleteUsers([member.userId]);
  }
});

it('una cuota vencida parcialmente pagada sigue contando como pendiente', async () => {
  const member = await createMember();

  try {
    await generateMonthlyFee(member.socioId, 2026, 9);

    await registerFeePayment({
      socioId: member.socioId,
      registradoPorId: member.userId,
      importe: 300,
      fechaPago: new Date('2026-09-20'),
      medioPago: 'EFECTIVO',
    });

    const status = await getMemberFeeStatus(
      member.socioId,
      new Date('2026-10-01T12:00:00Z'),
    );

    expect(status.estado).toBe('PENDIENTE');
    expect(status.cuotasVencidas).toBe(1);
    expect(status.deudaVencida).toBe(460);
  } finally {
    await deleteMemberPayments([member.socioId]);

    await prisma.cuota.deleteMany({
      where: { socioId: member.socioId },
    });

    await deleteUsers([member.userId]);
  }
});

it('una cuota vencida totalmente pagada no cuenta como deuda', async () => {
  const member = await createMember();

  try {
    await generateMonthlyFee(member.socioId, 2026, 9);

    await registerFeePayment({
      socioId: member.socioId,
      registradoPorId: member.userId,
      importe: 760,
      fechaPago: new Date('2026-09-20'),
      medioPago: 'EFECTIVO',
    });

    const status = await getMemberFeeStatus(
      member.socioId,
      new Date('2026-10-01T12:00:00Z'),
    );

    expect(status.estado).toBe('AL_DIA');
    expect(status.cuotasVencidas).toBe(0);
    expect(status.deudaVencida).toBe(0);
  } finally {
    await deleteMemberPayments([member.socioId]);

    await prisma.cuota.deleteMany({
      where: { socioId: member.socioId },
    });

    await deleteUsers([member.userId]);
  }
});

describe('Permisos de consulta de cuotas', () => {
  it('permite a ADMIN consultar las cuotas de cualquier socio', async () => {
    const admin = await createAdmin();
    const member = await createMember();

    try {
      const response = await request(app)
        .get(`/cuotas/socio/${member.socioId}`)
        .set('Cookie', admin.cookie);

      expect(response.status).toBe(200);
    } finally {
      await deleteMemberPayments([member.socioId]);

      await prisma.cuota.deleteMany({
        where: {
          socioId: member.socioId,
        },
      });

      await deleteUsers([admin.userId, member.userId]);
    }
  });

  it('permite a DIRECTIVO consultar las cuotas de cualquier socio', async () => {
    const directivo = await createMember('DIRECTIVO');
    const member = await createMember();

    try {
      const response = await request(app)
        .get(`/cuotas/socio/${member.socioId}`)
        .set('Cookie', directivo.cookie);

      expect(response.status).toBe(200);
    } finally {
      await deleteMemberPayments([directivo.socioId, member.socioId]);

      await prisma.cuota.deleteMany({
        where: {
          socioId: {
            in: [directivo.socioId, member.socioId],
          },
        },
      });

      await deleteUsers([directivo.userId, member.userId]);
    }
  });

  it('permite a un socio común consultar sus propias cuotas', async () => {
    const member = await createMember();

    try {
      const response = await request(app)
        .get(`/cuotas/socio/${member.socioId}`)
        .set('Cookie', member.cookie);

      expect(response.status).toBe(200);
    } finally {
      await deleteMemberPayments([member.socioId]);

      await prisma.cuota.deleteMany({
        where: {
          socioId: member.socioId,
        },
      });

      await deleteUsers([member.userId]);
    }
  });

  it('impide a un socio común consultar las cuotas de otro socio', async () => {
    const member = await createMember();
    const otherMember = await createMember();

    try {
      const response = await request(app)
        .get(`/cuotas/socio/${otherMember.socioId}`)
        .set('Cookie', member.cookie);

      expect(response.status).toBe(403);
    } finally {
      await deleteMemberPayments([member.socioId, otherMember.socioId]);

      await prisma.cuota.deleteMany({
        where: {
          socioId: {
            in: [member.socioId, otherMember.socioId],
          },
        },
      });

      await deleteUsers([member.userId, otherMember.userId]);
    }
  });

  it('impide a POSTULANTE consultar cuotas de un socio', async () => {
    const applicant = await createApplicant();
    const member = await createMember();

    try {
      const response = await request(app)
        .get(`/cuotas/socio/${member.socioId}`)
        .set('Cookie', applicant.cookie);

      expect(response.status).toBe(403);
    } finally {
      await deleteMemberPayments([member.socioId]);

      await prisma.cuota.deleteMany({
        where: {
          socioId: member.socioId,
        },
      });

      await deleteUsers([applicant.userId, member.userId]);
    }
  });

  it('impide consultar cuotas sin autenticación', async () => {
    const member = await createMember();

    try {
      const response = await request(app).get(
        `/cuotas/socio/${member.socioId}`,
      );

      expect(response.status).toBe(401);
    } finally {
      await deleteMemberPayments([member.socioId]);

      await prisma.cuota.deleteMany({
        where: {
          socioId: member.socioId,
        },
      });

      await deleteUsers([member.userId]);
    }
  });

  it('aplica los permisos también al estado y los ajustes del socio', async () => {
    const member = await createMember();
    const otherMember = await createMember();

    try {
      const statusResponse = await request(app)
        .get(`/cuotas/socio/${otherMember.socioId}/estado`)
        .set('Cookie', member.cookie);

      const adjustmentsResponse = await request(app)
        .get(`/cuotas/socio/${otherMember.socioId}/ajustes`)
        .set('Cookie', member.cookie);

      expect(statusResponse.status).toBe(403);
      expect(adjustmentsResponse.status).toBe(403);
    } finally {
      await deleteMemberPayments([member.socioId, otherMember.socioId]);

      await prisma.cuota.deleteMany({
        where: {
          socioId: {
            in: [member.socioId, otherMember.socioId],
          },
        },
      });

      await deleteUsers([member.userId, otherMember.userId]);
    }
  });
});

it('devuelve el historial de pagos del socio con el detalle de cuotas', async () => {
  const admin = await createAdmin();
  const member = await createMember();

  try {
    await generateMonthlyFee(member.socioId, 2026, 9);

    await registerFeePayment({
      socioId: member.socioId,
      registradoPorId: admin.userId,
      importe: 300,
      fechaPago: new Date('2026-09-20'),
      medioPago: 'EFECTIVO',
      comprobanteUrl: 'https://comprobantes.test/REC-TEST-001.pdf',
      observaciones: 'Pago parcial de prueba',
    });

    const response = await request(app)
      .get(`/cuotas/socio/${member.socioId}/pagos`)
      .set('Cookie', admin.cookie);

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(1);

    expect(response.body[0]).toMatchObject({
      socioId: member.socioId,
      medioPago: 'EFECTIVO',
      comprobanteUrl: 'https://comprobantes.test/REC-TEST-001.pdf',
      observaciones: 'Pago parcial de prueba',
    });

    expect(Number(response.body[0].importe)).toBe(300);

    expect(response.body[0].detalles).toHaveLength(1);
    expect(Number(response.body[0].detalles[0].importeAplicado)).toBe(300);

    expect(response.body[0].detalles[0].cuota).toBeDefined();
  } finally {
    await deleteMemberPayments([member.socioId]);

    await prisma.cuota.deleteMany({
      where: {
        socioId: member.socioId,
      },
    });

    await deleteUsers([admin.userId, member.userId]);
  }
});

it('impide a un socio común consultar el historial de pagos de otro socio', async () => {
  const member = await createMember();
  const otherMember = await createMember();

  try {
    const response = await request(app)
      .get(`/cuotas/socio/${otherMember.socioId}/pagos`)
      .set('Cookie', member.cookie);

    expect(response.status).toBe(403);
  } finally {
    await deleteMemberPayments([member.socioId, otherMember.socioId]);

    await prisma.cuota.deleteMany({
      where: {
        socioId: {
          in: [member.socioId, otherMember.socioId],
        },
      },
    });

    await deleteUsers([member.userId, otherMember.userId]);
  }
});

it('al eliminar un ajuste conserva las cuotas pagadas y recalcula las pendientes', async () => {
  const member = await createMember();

  try {
    const adjustment = await prisma.ajusteCuotaSocio.create({
      data: {
        socioId: member.socioId,
        tipo: 'ADICIONAL',
        importe: 100,
        fechaDesde: new Date('2026-09-01'),
        fechaHasta: new Date('2026-10-31'),
        motivo: 'Ajuste de prueba',
      },
    });

    const septemberFee = await generateMonthlyFee(member.socioId, 2026, 9);

    const octoberFee = await generateMonthlyFee(member.socioId, 2026, 10);

    expect(Number(septemberFee.importeAjustes)).toBe(100);
    expect(Number(septemberFee.importeTotal)).toBe(860);

    expect(Number(octoberFee.importeAjustes)).toBe(100);
    expect(Number(octoberFee.importeTotal)).toBe(860);

    await registerFeePayment({
      socioId: member.socioId,
      registradoPorId: member.userId,
      importe: 860,
      fechaPago: new Date('2026-09-20'),
      medioPago: 'EFECTIVO',
    });

    const result = await removeFeeAdjustment(adjustment.id);

    expect(result.activo).toBe(false);
    expect(result.cuotasPagadasNoModificadas).toBe(1);

    const updatedSeptemberFee = await prisma.cuota.findUnique({
      where: {
        id: septemberFee.id,
      },
    });

    const updatedOctoberFee = await prisma.cuota.findUnique({
      where: {
        id: octoberFee.id,
      },
    });

    expect(updatedSeptemberFee?.estado).toBe('PAGADA');
    expect(Number(updatedSeptemberFee?.importeAjustes)).toBe(100);
    expect(Number(updatedSeptemberFee?.importeTotal)).toBe(860);

    expect(updatedOctoberFee?.estado).toBe('PENDIENTE');
    expect(Number(updatedOctoberFee?.importeAjustes)).toBe(0);
    expect(Number(updatedOctoberFee?.importeTotal)).toBe(760);

    const deletedAdjustment = await prisma.ajusteCuotaSocio.findUnique({
      where: {
        id: adjustment.id,
      },
    });

    expect(deletedAdjustment?.activo).toBe(false);
  } finally {
    await deleteMemberPayments([member.socioId]);

    await prisma.cuota.deleteMany({
      where: {
        socioId: member.socioId,
      },
    });

    await prisma.ajusteCuotaSocio.deleteMany({
      where: {
        socioId: member.socioId,
      },
    });

    await deleteUsers([member.userId]);
  }
});

describe('Resumen de cuotas', () => {
  it('cuenta como al día a un socio activo sin cuotas', async () => {
    const member = await createMember();

    try {
      const summary = await getFeesDashboardSummary(
        new Date('2026-09-15T12:00:00Z'),
      );

      expect(summary.sociosAlDia).toBeGreaterThanOrEqual(1);
    } finally {
      await deleteUsers([member.userId]);
    }
  });

  it('cuenta como pendiente a un socio con una cuota vencida', async () => {
    const member = await createMember();

    try {
      await generateMonthlyFee(member.socioId, 2026, 8);

      const summary = await getFeesDashboardSummary(
        new Date('2026-10-01T12:00:00Z'),
      );

      expect(summary.sociosPendientes).toBeGreaterThanOrEqual(1);
      expect(summary.deudaTotal).toBeGreaterThanOrEqual(760);
    } finally {
      await deleteMemberPayments([member.socioId]);

      await prisma.cuota.deleteMany({
        where: { socioId: member.socioId },
      });

      await deleteUsers([member.userId]);
    }
  });

  it('cuenta como deudor a un socio con tres cuotas vencidas', async () => {
    const member = await createMember();

    try {
      await generateMonthlyFee(member.socioId, 2026, 7);
      await generateMonthlyFee(member.socioId, 2026, 8);
      await generateMonthlyFee(member.socioId, 2026, 9);

      const summary = await getFeesDashboardSummary(
        new Date('2026-10-01T12:00:00Z'),
      );

      expect(summary.sociosDeudores).toBeGreaterThanOrEqual(1);
      expect(summary.deudaTotal).toBeGreaterThanOrEqual(2280);
    } finally {
      await deleteMemberPayments([member.socioId]);

      await prisma.cuota.deleteMany({
        where: { socioId: member.socioId },
      });

      await deleteUsers([member.userId]);
    }
  });

  it('suma en cobradoMes solamente los pagos realizados durante ese mes', async () => {
    const admin = await createAdmin();
    const member = await createMember();

    try {
      await generateMonthlyFee(member.socioId, 2026, 8);
      await generateMonthlyFee(member.socioId, 2026, 9);

      await registerFeePayment({
        socioId: member.socioId,
        registradoPorId: admin.userId,
        importe: 760,
        fechaPago: new Date('2026-08-20T12:00:00Z'),
        medioPago: 'EFECTIVO',
      });

      await registerFeePayment({
        socioId: member.socioId,
        registradoPorId: admin.userId,
        importe: 300,
        fechaPago: new Date('2026-09-15T12:00:00Z'),
        medioPago: 'EFECTIVO',
      });

      const summary = await getFeesDashboardSummary(
        new Date('2026-09-20T12:00:00Z'),
      );

      expect(summary.cobradoMes).toBeGreaterThanOrEqual(300);
    } finally {
      await deleteMemberPayments([member.socioId]);

      await prisma.cuota.deleteMany({
        where: { socioId: member.socioId },
      });

      await deleteUsers([admin.userId, member.userId]);
    }
  });
});

it('permite a un administrador obtener el resumen del dashboard', async () => {
  const admin = await createAdmin();

  try {
    const response = await request(app)
      .get('/cuotas/resumen')
      .set('Cookie', admin.cookie);

    expect(response.status).toBe(200);

    expect(response.body).toHaveProperty('cobradoMes');
    expect(response.body).toHaveProperty('deudaTotal');
    expect(response.body).toHaveProperty('sociosAlDia');
    expect(response.body).toHaveProperty('sociosPendientes');
    expect(response.body).toHaveProperty('sociosDeudores');
  } finally {
    await deleteUsers([admin.userId]);
  }
});

it('no muestra el error de la base cuando algo falla de forma inesperada', async () => {
  // La fecha inválida llega a Prisma antes de que el service la valide. Antes
  // la respuesta traía el mensaje de Prisma entero: la ruta del archivo en el
  // servidor, las líneas del código y la consulta.
  const admin = await createAdmin();

  try {
    const response = await request(app)
      .post('/cuotas/configuracion')
      .set('Cookie', admin.cookie)
      .send({
        importeBase: 100,
        vigenciaDesde: 'no-es-una-fecha',
      });

    expect(response.status).toBe(500);
    expect(response.body.message).toBe(
      'Error al crear la configuración de cuota',
    );
  } finally {
    await deleteUsers([admin.userId]);
  }
});

describe('Edición de la configuración de cuota', () => {
  let admin: Awaited<ReturnType<typeof createAdmin>>;
  let futureConfigurationId: number;

  // Un año lejano a propósito: las cuotas buscan la configuración con
  // `vigenciaDesde <= fecha`, así que esta no la toma ningún otro test.
  const futureDate = new Date(Date.UTC(2099, 0, 1));

  beforeAll(async () => {
    admin = await createAdmin();

    const configuration = await prisma.configuracionCuota.create({
      data: {
        importeBase: 1000,
        vigenciaDesde: futureDate,
      },
    });

    futureConfigurationId = configuration.id;
  });

  afterAll(async () => {
    await prisma.configuracionCuota.delete({
      where: { id: futureConfigurationId },
    });

    await deleteUsers([admin.userId]);
  });

  it('permite modificar una configuración futura', async () => {
    const response = await request(app)
      .patch(`/cuotas/configuracion/${futureConfigurationId}`)
      .set('Cookie', admin.cookie)
      .send({ importeBase: 1200 });

    expect(response.status).toBe(200);
    expect(Number(response.body.importeBase)).toBe(1200);
  });

  it('no modifica una configuración vigente aunque se lo pidan', async () => {
    // Antes el importe se guardaba y recién después se controlaba la fecha:
    // la respuesta era un error, pero el cambio ya estaba en la base.
    const current = await prisma.configuracionCuota.findFirstOrThrow({
      where: { vigenciaDesde: { lte: new Date() } },
      orderBy: { vigenciaDesde: 'desc' },
    });

    const response = await request(app)
      .patch(`/cuotas/configuracion/${current.id}`)
      .set('Cookie', admin.cookie)
      .send({ importeBase: Number(current.importeBase) + 1 });

    const stored = await prisma.configuracionCuota.findUniqueOrThrow({
      where: { id: current.id },
    });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe(
      'Solo se pueden modificar configuraciones de cuota futuras',
    );
    expect(Number(stored.importeBase)).toBe(Number(current.importeBase));
  });

  it('rechaza con 400 un pedido sin importe', async () => {
    const response = await request(app)
      .patch(`/cuotas/configuracion/${futureConfigurationId}`)
      .set('Cookie', admin.cookie)
      .send({});

    expect(response.status).toBe(400);
    expect(response.body.message).toBe(
      'El importe de la cuota debe ser mayor a 0',
    );
  });
});
