import request from 'supertest';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import app from '../src/app';
import { prisma } from '../src/config/prisma';
import {
    addFeeAdjustment,
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
import { storageFalso } from './storage-falso';

// Supabase Storage se reemplaza por uno en memoria (ver storage-falso.ts).
vi.mock('../src/config/supabase', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('../src/config/supabase')>();
  const { supabaseFalso } = await import('./storage-falso.js');

  return { ...original, getSupabase: () => supabaseFalso };
});

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

  it('impide registrar dos pagos simultáneos sobre la misma deuda', async () => {
    const member = await createMember();

    try {
      const fee = await generateMonthlyFee(member.socioId, 2026, 7);

      const paymentData = {
        socioId: member.socioId,
        registradoPorId: member.userId,
        importe: 760,
        fechaPago: new Date('2026-07-15'),
        medioPago: 'EFECTIVO',
      };

      // Las dos solicitudes intentan pagar la misma deuda.
      const results = await Promise.allSettled([
        registerFeePayment(paymentData),
        registerFeePayment(paymentData),
      ]);

      const successful = results.filter(
        (result) => result.status === 'fulfilled',
      );

      const failed = results.filter((result) => result.status === 'rejected');


      expect(successful).toHaveLength(1);
      expect(failed).toHaveLength(1);

      // El segundo pago debe rechazarse porque la deuda ya fue cubierta.
      const rejection = failed[0];

      expect(rejection?.status).toBe('rejected');

      const reason =
        rejection?.status === 'rejected' ? rejection.reason : undefined;

      expect(reason).toBeInstanceOf(Error);
      expect((reason as Error).message).toBe(
        'El socio no tiene cuotas pendientes',
      );

      // Solo debe existir un pago válido.
      const payments = await prisma.pagoCuota.findMany({
        where: {
          socioId: member.socioId,
        },
        include: {
          detalles: true,
          movimientoCaja: true,
        },
      });

      expect(payments).toHaveLength(1);
      expect(Number(payments[0].importe)).toBe(760);
      expect(payments[0].anulado).toBe(false);

      // El importe aplicado no puede superar la deuda.
      expect(payments[0].detalles).toHaveLength(1);
      expect(payments[0].detalles[0].cuotaId).toBe(fee.id);
      expect(Number(payments[0].detalles[0].importeAplicado)).toBe(760);

      // Debe existir un único movimiento de caja asociado.
      expect(payments[0].movimientoCaja).not.toBeNull();
      expect(Number(payments[0].movimientoCaja!.importe)).toBe(760);
      expect(payments[0].movimientoCaja!.anulado).toBe(false);

      const cashMovements = await prisma.movimientoCaja.count({
        where: {
          pagoCuotaId: payments[0].id,
        },
      });

      expect(cashMovements).toBe(1);

      // La cuota debe quedar completamente pagada.
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
      });

      const secondPayment = await registerFeePayment({
        socioId: member.socioId,
        registradoPorId: admin.userId,
        importe: 460,
        fechaPago: new Date('2026-07-20'),
        medioPago: 'EFECTIVO',
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

  it('responde 404 para un socio que no existe en las cuatro consultas', async () => {
    // Antes respondían 200: listas vacías y un estado "al día" con deuda 0,
    // lo mismo que para un socio real sin cuotas.
    const admin = await createAdmin();
    // El mayor entero de la base: es un id válido que ningún socio tiene.
    const missingId = 2147483647;

    try {
      const paths = ['', '/ajustes', '/pagos', '/estado'];
      const results: Record<string, unknown> = {};

      for (const path of paths) {
        const response = await request(app)
          .get(`/cuotas/socio/${missingId}${path}`)
          .set('Cookie', admin.cookie);

        results[path || '/'] = [response.status, response.body.message];
      }

      const expected = paths.map((path) => [
        path || '/',
        [404, 'Socio no encontrado'],
      ]);

      expect(results).toEqual(Object.fromEntries(expected));
    } finally {
      await deleteUsers([admin.userId]);
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

it('revierte la creación del ajuste si el recálculo falla', async () => {
  const member = await createMember();

  try {
    const fee = await generateMonthlyFee(member.socioId, 2026, 7);

    const adjustmentsBefore = await prisma.ajusteCuotaSocio.count({
      where: { socioId: member.socioId },
    });

    await expect(
      addFeeAdjustment({
        socioId: member.socioId,
        tipo: 'DESCUENTO',
        importe: 1000,
        fechaDesde: new Date(Date.UTC(2026, 6, 1)),
        fechaHasta: new Date(Date.UTC(2026, 6, 31)),
        motivo: 'Prueba de rollback',
      }),
    ).rejects.toThrow(
      'Los ajustes no pueden generar una cuota con importe negativo',
    );

    const adjustmentsAfter = await prisma.ajusteCuotaSocio.count({
      where: { socioId: member.socioId },
    });

    const updatedFee = await prisma.cuota.findUniqueOrThrow({
      where: { id: fee.id },
    });

    expect(adjustmentsAfter).toBe(adjustmentsBefore);
    expect(Number(updatedFee.importeTotal)).toBe(760);
    expect(Number(updatedFee.importeAjustes)).toBe(0);
    expect(updatedFee.estado).toBe('PENDIENTE');
  } finally {
    await deleteMemberPayments([member.socioId]);
    await prisma.ajusteCuotaSocio.deleteMany({
      where: { socioId: member.socioId },
    });
    await prisma.cuota.deleteMany({
      where: { socioId: member.socioId },
    });
    await deleteUsers([member.userId]);
  }
});

it('revierte la eliminación de un ajuste si el recálculo falla', async () => {
  const member = await createMember();

  try {
    // La cuota base es de $760.
    // Creamos dos ajustes: +$500 y -$1000.
    // El total resultante es $260.
    const additional = await prisma.ajusteCuotaSocio.create({
      data: {
        socioId: member.socioId,
        tipo: 'ADICIONAL',
        importe: 500,
        fechaDesde: new Date(Date.UTC(2026, 6, 1)),
        fechaHasta: new Date(Date.UTC(2026, 6, 31)),
        motivo: 'Adicional de prueba',
      },
    });

    await prisma.ajusteCuotaSocio.create({
      data: {
        socioId: member.socioId,
        tipo: 'DESCUENTO',
        importe: 1000,
        fechaDesde: new Date(Date.UTC(2026, 6, 1)),
        fechaHasta: new Date(Date.UTC(2026, 6, 31)),
        motivo: 'Descuento de prueba',
      },
    });

    const fee = await generateMonthlyFee(member.socioId, 2026, 7);

    expect(Number(fee.importeTotal)).toBe(260);

    // Al eliminar el adicional, el total sería:
    // 760 - 1000 = -240. La operación debe fallar.
    await expect(removeFeeAdjustment(additional.id)).rejects.toThrow(
      'Los ajustes no pueden generar una cuota con importe negativo',
    );

    // El ajuste debe seguir activo porque la transacción hizo rollback.
    const updatedAdjustment =
      await prisma.ajusteCuotaSocio.findUniqueOrThrow({
        where: { id: additional.id },
      });

    expect(updatedAdjustment.activo).toBe(true);

    // La cuota tampoco debe haber cambiado.
    const updatedFee = await prisma.cuota.findUniqueOrThrow({
      where: { id: fee.id },
    });

    expect(Number(updatedFee.importeTotal)).toBe(260);
    expect(Number(updatedFee.importeAjustes)).toBe(-500);
    expect(updatedFee.estado).toBe('PENDIENTE');
  } finally {
    await deleteMemberPayments([member.socioId]);

    await prisma.ajusteCuotaSocio.deleteMany({
      where: { socioId: member.socioId },
    });

    await prisma.cuota.deleteMany({
      where: { socioId: member.socioId },
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

it('rechaza una fecha de vigencia inválida con su propio mensaje', async () => {
  // La fecha inválida llegaba a Prisma antes de que el service la validara.
  // Primero la respuesta traía el mensaje de Prisma entero (la ruta del
  // archivo en el servidor, las líneas del código y la consulta); después,
  // un 500 genérico. El escaneo de ZAP lo provocó 188 veces.
  const admin = await createAdmin();

  try {
    const response = await request(app)
      .post('/cuotas/configuracion')
      .set('Cookie', admin.cookie)
      .send({
        importeBase: 100,
        vigenciaDesde: 'no-es-una-fecha',
      });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      message: 'La fecha de vigencia no es válida',
    });
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

describe('Comprobante del pago de cuota', () => {
  // El comprobante de un pago vive en su movimiento de caja, igual que el de
  // cualquier otro movimiento. Antes se intentaba guardar en
  // `pago_cuota.comprobante_url`, una columna que la migración
  // 20261008221118 había borrado: ningún pago con tarjeta se podía registrar.
  const PDF = Buffer.from('%PDF-1.7\nComprobante de prueba');
  const pdf = { filename: 'comprobante.pdf', contentType: 'application/pdf' };

  let admin: Awaited<ReturnType<typeof createAdmin>>;
  const members: Awaited<ReturnType<typeof createMember>>[] = [];

  beforeAll(async () => {
    admin = await createAdmin();
  });

  beforeEach(() => {
    storageFalso.reset();
  });

  afterAll(async () => {
    const socioIds = members.map((member) => member.socioId);

    await deleteMemberPayments(socioIds);
    await prisma.cuota.deleteMany({ where: { socioId: { in: socioIds } } });
    await deleteUsers([admin.userId, ...members.map((m) => m.userId)]);
  });

  /** Un socio nuevo con una cuota de julio de 760 pendiente. */
  async function memberWithFee() {
    const member = await createMember();
    members.push(member);

    await generateMonthlyFee(member.socioId, 2026, 7);

    return member;
  }

  function pay(
    socioId: number,
    fields: Record<string, string>,
    file?: { content: Buffer; filename: string; contentType: string },
  ) {
    const req = request(app)
      .post(`/cuotas/socio/${socioId}/pagos`)
      .set('Cookie', admin.cookie);

    for (const [name, value] of Object.entries(fields)) {
      req.field(name, value);
    }

    if (file) {
      req.attach('comprobante', file.content, {
        filename: file.filename,
        contentType: file.contentType,
      });
    }

    return req;
  }

  const cardPayment = {
    importe: '760',
    fechaPago: '2026-07-15',
    medioPago: 'TARJETA',
  };

  function paymentsOf(socioId: number) {
    return prisma.pagoCuota.findMany({
      where: { socioId },
      include: { movimientoCaja: true },
    });
  }

  it('registra un pago con tarjeta y guarda el comprobante en su movimiento de caja', async () => {
    const member = await memberWithFee();

    const response = await pay(member.socioId, cardPayment, {
      content: PDF,
      ...pdf,
    });

    expect(response.status).toBe(201);

    const path = response.body.movimientoCaja.comprobanteUrl;

    expect(path).toMatch(
      new RegExp(`^pagos-cuota/socio-${member.socioId}/[0-9a-f-]{36}\\.pdf$`),
    );
    expect(storageFalso.files.get(path)).toBe('application/pdf');

    const [payment] = await paymentsOf(member.socioId);

    expect(payment.movimientoCaja?.comprobanteUrl).toBe(path);
    expect(payment.movimientoCaja?.id).toBe(response.body.movimientoCaja.id);
  });

  it('rechaza un pago con tarjeta sin comprobante y no registra nada', async () => {
    const member = await memberWithFee();

    const response = await pay(member.socioId, cardPayment);

    expect(response.status).toBe(400);
    expect(response.body.message).toBe(
      'El comprobante es obligatorio para pagos con tarjeta',
    );
    expect(await paymentsOf(member.socioId)).toHaveLength(0);
  });

  it('sigue aceptando un pago sin comprobante enviado como JSON', async () => {
    // El frontend anterior a este cambio manda JSON: efectivo y transferencia
    // tienen que seguir funcionando igual.
    const member = await memberWithFee();

    const response = await request(app)
      .post(`/cuotas/socio/${member.socioId}/pagos`)
      .set('Cookie', admin.cookie)
      .send({ importe: 760, fechaPago: '2026-07-15', medioPago: 'EFECTIVO' });

    expect(response.status).toBe(201);
    expect(response.body.movimientoCaja.comprobanteUrl).toBeNull();
  });

  it('acepta un comprobante opcional en un pago por transferencia', async () => {
    const member = await memberWithFee();

    const response = await pay(
      member.socioId,
      { ...cardPayment, medioPago: 'TRANSFERENCIA' },
      { content: PDF, ...pdf },
    );

    expect(response.status).toBe(201);
    expect(
      storageFalso.files.has(response.body.movimientoCaja.comprobanteUrl),
    ).toBe(true);
  });

  it('no sube nada si el pago no pasa las validaciones', async () => {
    // Las reglas del pago se revisan antes de subir el archivo: un pago
    // rechazado no deja un comprobante huérfano en Storage.
    const member = await memberWithFee();

    const response = await pay(
      member.socioId,
      { ...cardPayment, importe: '100000' },
      { content: PDF, ...pdf },
    );

    expect(response.status).toBe(400);
    expect(response.body.message).toBe(
      'El importe del pago no puede superar la deuda pendiente',
    );
    expect(storageFalso.files.size).toBe(0);
  });

  it('borra el comprobante subido si después falla la grabación del pago', async () => {
    // Para que falle la transacción con el archivo ya subido se usa un límite
    // de la base: `observaciones` es VARCHAR(500) y el service no lo valida,
    // así que 501 caracteres hacen fallar el insert del pago (Prisma P2000,
    // que `sendError` responde como 400).
    const member = await memberWithFee();

    const response = await pay(
      member.socioId,
      { ...cardPayment, observaciones: 'x'.repeat(501) },
      { content: PDF, ...pdf },
    );

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      message: 'Uno de los datos es demasiado largo',
    });
    expect(storageFalso.files.size).toBe(0);
    expect(await paymentsOf(member.socioId)).toHaveLength(0);
  });

  it('no registra el pago si falla Storage, y no muestra su error', async () => {
    const member = await memberWithFee();
    storageFalso.failing = true;

    const response = await pay(member.socioId, cardPayment, {
      content: PDF,
      ...pdf,
    });

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ message: 'Error al registrar el pago' });
    expect(await paymentsOf(member.socioId)).toHaveLength(0);
  });

  it('decide el tipo por el contenido y no por lo que declara el archivo', async () => {
    const member = await memberWithFee();

    const response = await pay(member.socioId, cardPayment, {
      content: Buffer.from('<script>alert(1)</script>'),
      ...pdf,
    });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe(
      'El archivo no es un PDF, JPG o PNG válido',
    );
    expect(await paymentsOf(member.socioId)).toHaveLength(0);
  });

  it('responde 413 a un comprobante de más de 5 MB', async () => {
    const member = await memberWithFee();

    const response = await pay(member.socioId, cardPayment, {
      content: Buffer.concat([PDF, Buffer.alloc(5 * 1024 * 1024)]),
      ...pdf,
    });

    expect(response.status).toBe(413);
    expect(response.body.message).toBe(
      'El comprobante no puede superar los 5 MB',
    );
    expect(await paymentsOf(member.socioId)).toHaveLength(0);
  });

  it('el historial dice qué movimiento tiene el comprobante, y se puede ver desde caja', async () => {
    const member = await memberWithFee();

    const created = await pay(member.socioId, cardPayment, {
      content: PDF,
      ...pdf,
    });

    const history = await request(app)
      .get(`/cuotas/socio/${member.socioId}/pagos`)
      .set('Cookie', admin.cookie);

    expect(history.status).toBe(200);
    expect(history.body[0].movimientoCaja).toEqual(created.body.movimientoCaja);

    const receipt = await request(app)
      .get(`/caja/movimientos/${history.body[0].movimientoCaja.id}/comprobante`)
      .set('Cookie', admin.cookie);

    expect(receipt.status).toBe(200);
    expect(receipt.body.url).toBe(
      `https://storage.test/${created.body.movimientoCaja.comprobanteUrl}?expira=60`,
    );
  });
});
