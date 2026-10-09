import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';

import app from '../src/app';
import { prisma } from '../src/config/prisma';
import type { MovimientoCaja } from '../src/generated/prisma/client';
import {
  addManualCashMovement,
  cancelManualCashMovement,
  getCashMovements,
} from '../src/modules/cash-movement/cash-movement.service';
import {
  createAdmin,
  createMember,
  deleteMemberPayments,
  deleteUsers,
  uniqueSuffix,
} from './session';

describe('Movimientos de caja', () => {
  const createdUserIds: number[] = [];
  const createdCategoryIds: number[] = [];
  const createdMovementIds: number[] = [];

  afterAll(async () => {
    if (createdMovementIds.length > 0) {
      await prisma.movimientoCaja.deleteMany({
        where: {
          id: {
            in: createdMovementIds,
          },
        },
      });
    }

    if (createdCategoryIds.length > 0) {
      await prisma.categoriaCaja.deleteMany({
        where: {
          id: {
            in: createdCategoryIds,
          },
        },
      });
    }

    if (createdUserIds.length > 0) {
      await deleteUsers(createdUserIds);
    }

    await prisma.$disconnect();
  });

  async function createCategory(tipo: 'INGRESO' | 'EGRESO', activa = true) {
    const category = await prisma.categoriaCaja.create({
      data: {
        nombre: `Categoría test ${uniqueSuffix()}`,
        tipo,
        activa,
      },
    });

    createdCategoryIds.push(category.id);

    return category;
  }

  async function createTrackedMovement(
    data: Parameters<typeof addManualCashMovement>[0],
  ) {
    const movement = await addManualCashMovement(data);

    createdMovementIds.push(movement.id);

    return movement;
  }

  it('registra manualmente un ingreso', async () => {
    const admin = await createAdmin();
    createdUserIds.push(admin.userId);

    const category = await createCategory('INGRESO');

    const movement = await createTrackedMovement({
      tipo: 'INGRESO',
      categoriaId: category.id,
      concepto: 'Ingreso de prueba',
      importe: 1500,
      fecha: new Date('2026-09-10'),
      observaciones: 'Movimiento creado por test',
      registradoPorId: admin.userId,
    });

    expect(movement.tipo).toBe('INGRESO');
    expect(movement.categoriaId).toBe(category.id);
    expect(movement.concepto).toBe('Ingreso de prueba');
    expect(Number(movement.importe)).toBe(1500);
    expect(movement.registradoPorId).toBe(admin.userId);
    expect(movement.categoria.id).toBe(category.id);
  });

  it('registra manualmente un egreso', async () => {
    const admin = await createAdmin();
    createdUserIds.push(admin.userId);

    const category = await createCategory('EGRESO');

    const movement = await createTrackedMovement({
      tipo: 'EGRESO',
      categoriaId: category.id,
      concepto: 'Egreso de prueba',
      importe: 500,
      fecha: new Date('2026-09-11'),
      registradoPorId: admin.userId,
    });

    expect(movement.tipo).toBe('EGRESO');
    expect(Number(movement.importe)).toBe(500);
    expect(movement.categoriaId).toBe(category.id);
  });

  it('no permite usar una categoría de otro tipo', async () => {
    const admin = await createAdmin();
    createdUserIds.push(admin.userId);

    const category = await createCategory('EGRESO');

    await expect(
      addManualCashMovement({
        tipo: 'INGRESO',
        categoriaId: category.id,
        concepto: 'Movimiento inválido',
        importe: 500,
        fecha: new Date('2026-09-12'),
        registradoPorId: admin.userId,
      }),
    ).rejects.toThrow('La categoría no corresponde al tipo de movimiento');
  });

  it('no permite utilizar una categoría inactiva', async () => {
    const admin = await createAdmin();
    createdUserIds.push(admin.userId);

    const category = await createCategory('INGRESO', false);

    await expect(
      addManualCashMovement({
        tipo: 'INGRESO',
        categoriaId: category.id,
        concepto: 'Movimiento inválido',
        importe: 500,
        fecha: new Date('2026-09-12'),
        registradoPorId: admin.userId,
      }),
    ).rejects.toThrow('La categoría está inactiva');
  });

  it('no permite registrar un movimiento con importe cero o negativo', async () => {
    const admin = await createAdmin();
    createdUserIds.push(admin.userId);

    const category = await createCategory('INGRESO');

    await expect(
      addManualCashMovement({
        tipo: 'INGRESO',
        categoriaId: category.id,
        concepto: 'Importe inválido',
        importe: 0,
        fecha: new Date('2026-09-12'),
        registradoPorId: admin.userId,
      }),
    ).rejects.toThrow('El importe debe ser mayor a cero');
  });

  it('filtra movimientos por tipo, categoría, fecha y búsqueda', async () => {
    const admin = await createAdmin();
    createdUserIds.push(admin.userId);

    const incomeCategory = await createCategory('INGRESO');
    const expenseCategory = await createCategory('EGRESO');

    const uniqueText = `FiltroCaja-${uniqueSuffix()}`;

    const income = await createTrackedMovement({
      tipo: 'INGRESO',
      categoriaId: incomeCategory.id,
      concepto: `${uniqueText} ingreso especial`,
      importe: 1000,
      fecha: new Date('2026-08-10'),
      registradoPorId: admin.userId,
    });

    await createTrackedMovement({
      tipo: 'EGRESO',
      categoriaId: expenseCategory.id,
      concepto: `${uniqueText} egreso`,
      importe: 300,
      fecha: new Date('2026-08-15'),
      registradoPorId: admin.userId,
    });

    const movements = await getCashMovements({
      desde: new Date('2026-08-01'),
      hasta: new Date('2026-08-31'),
      tipo: 'INGRESO',
      categoriaId: incomeCategory.id,
      buscar: 'ingreso especial',
    });

    expect(
      movements.some((movement: MovimientoCaja) => movement.id === income.id),
    ).toBe(true);

    expect(
      movements.every(
        (movement: MovimientoCaja) => movement.tipo === 'INGRESO',
      ),
    ).toBe(true);

    expect(
      movements.every(
        (movement: MovimientoCaja) =>
          movement.categoriaId === incomeCategory.id,
      ),
    ).toBe(true);
  });

  it('anula lógicamente un movimiento manual', async () => {
    const admin = await createAdmin();
    createdUserIds.push(admin.userId);

    const category = await createCategory('INGRESO');

    const movement = await createTrackedMovement({
      tipo: 'INGRESO',
      categoriaId: category.id,
      concepto: 'Movimiento para anular',
      importe: 1200,
      fecha: new Date('2026-09-15'),
      registradoPorId: admin.userId,
    });

    const cancelled = await cancelManualCashMovement(
      movement.id,
      admin.userId,
      'Movimiento registrado por error',
    );

    expect(cancelled.anulado).toBe(true);
    expect(cancelled.anuladoPorId).toBe(admin.userId);
    expect(cancelled.fechaAnulacion).not.toBeNull();
    expect(cancelled.motivoAnulacion).toBe('Movimiento registrado por error');

    const storedMovement = await prisma.movimientoCaja.findUnique({
      where: {
        id: movement.id,
      },
    });

    // La anulación es lógica: el movimiento sigue existiendo.
    expect(storedMovement).not.toBeNull();
    expect(storedMovement?.anulado).toBe(true);
  });

  it('no permite anular dos veces el mismo movimiento', async () => {
    const admin = await createAdmin();
    createdUserIds.push(admin.userId);

    const category = await createCategory('INGRESO');

    const movement = await createTrackedMovement({
      tipo: 'INGRESO',
      categoriaId: category.id,
      concepto: 'Movimiento doble anulación',
      importe: 600,
      fecha: new Date('2026-09-16'),
      registradoPorId: admin.userId,
    });

    await cancelManualCashMovement(
      movement.id,
      admin.userId,
      'Primera anulación',
    );

    await expect(
      cancelManualCashMovement(movement.id, admin.userId, 'Segunda anulación'),
    ).rejects.toThrow('El movimiento ya está anulado');
  });

  it('no permite anular un movimiento sin motivo', async () => {
    const admin = await createAdmin();
    createdUserIds.push(admin.userId);

    const category = await createCategory('INGRESO');

    const movement = await createTrackedMovement({
      tipo: 'INGRESO',
      categoriaId: category.id,
      concepto: 'Movimiento sin motivo',
      importe: 700,
      fecha: new Date('2026-09-17'),
      registradoPorId: admin.userId,
    });

    await expect(
      cancelManualCashMovement(movement.id, admin.userId, '   '),
    ).rejects.toThrow('El motivo de anulación es obligatorio');

    const storedMovement = await prisma.movimientoCaja.findUnique({
      where: {
        id: movement.id,
      },
    });

    expect(storedMovement?.anulado).toBe(false);
  });

  it('excluye los movimientos anulados del resumen de caja', async () => {
    const admin = await createAdmin();
    createdUserIds.push(admin.userId);

    const category = await createCategory('INGRESO');

    const now = new Date();

    const movement = await createTrackedMovement({
      tipo: 'INGRESO',
      categoriaId: category.id,
      concepto: `Resumen cancelado ${uniqueSuffix()}`,
      importe: 9876,
      fecha: now,
      registradoPorId: admin.userId,
    });

    const beforeCancellation = await request(app)
      .get('/caja/movimientos/resumen')
      .set('Cookie', admin.cookie);

    expect(beforeCancellation.status).toBe(200);

    await cancelManualCashMovement(
      movement.id,
      admin.userId,
      'Excluir del resumen',
    );

    const afterCancellation = await request(app)
      .get('/caja/movimientos/resumen')
      .set('Cookie', admin.cookie);

    expect(afterCancellation.status).toBe(200);

    expect(Number(afterCancellation.body.ingresos)).toBe(
      Number(beforeCancellation.body.ingresos) - 9876,
    );

    expect(afterCancellation.body.cantidadMovimientos).toBe(
      beforeCancellation.body.cantidadMovimientos - 1,
    );
  });

  it('no permite anular desde caja un movimiento asociado a una cuota', async () => {
    const admin = await createAdmin();
    const member = await createMember();

    createdUserIds.push(admin.userId);

    try {
      const feeCategory = await prisma.categoriaCaja.findUnique({
        where: {
          nombre_tipo: {
            nombre: 'Cuotas de socios',
            tipo: 'INGRESO',
          },
        },
      });

      expect(feeCategory).not.toBeNull();

      const payment = await prisma.pagoCuota.create({
        data: {
          socioId: member.socioId,
          registradoPorId: admin.userId,
          importe: 100,
          fechaPago: new Date(),
          medioPago: 'EFECTIVO',
        },
      });

      const movement = await prisma.movimientoCaja.create({
        data: {
          tipo: 'INGRESO',
          categoriaId: feeCategory!.id,
          concepto: 'Pago de cuota test',
          importe: 100,
          fecha: new Date(),
          registradoPorId: admin.userId,
          pagoCuotaId: payment.id,
        },
      });

      createdMovementIds.push(movement.id);

      await expect(
        cancelManualCashMovement(
          movement.id,
          admin.userId,
          'Intento desde caja',
        ),
      ).rejects.toThrow(
        'Los movimientos asociados a cuotas no pueden anularse desde caja',
      );
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

  it('solo un administrador puede crear movimientos mediante la API', async () => {
    const admin = await createAdmin();
    const member = await createMember();

    createdUserIds.push(admin.userId);

    try {
      const category = await createCategory('INGRESO');

      const body = {
        tipo: 'INGRESO',
        categoriaId: category.id,
        concepto: 'Ingreso mediante API',
        importe: 1000,
        fecha: '2026-09-20',
      };

      const memberResponse = await request(app)
        .post('/caja/movimientos')
        .set('Cookie', member.cookie)
        .send(body);

      expect(memberResponse.status).toBe(403);

      const adminResponse = await request(app)
        .post('/caja/movimientos')
        .set('Cookie', admin.cookie)
        .send(body);

      expect(adminResponse.status).toBe(201);

      if (adminResponse.body.id) {
        createdMovementIds.push(adminResponse.body.id);
      }
    } finally {
      await deleteUsers([member.userId]);
    }
  });

  it('solo un administrador puede anular movimientos mediante la API', async () => {
    const admin = await createAdmin();
    const member = await createMember();

    createdUserIds.push(admin.userId);

    try {
      const category = await createCategory('INGRESO');

      const movement = await createTrackedMovement({
        tipo: 'INGRESO',
        categoriaId: category.id,
        concepto: 'Movimiento protegido',
        importe: 500,
        fecha: new Date('2026-09-21'),
        registradoPorId: admin.userId,
      });

      const memberResponse = await request(app)
        .patch(`/caja/movimientos/${movement.id}/anular`)
        .set('Cookie', member.cookie)
        .send({
          motivo: 'No debería poder hacerlo',
        });

      expect(memberResponse.status).toBe(403);

      const storedMovement = await prisma.movimientoCaja.findUnique({
        where: {
          id: movement.id,
        },
      });

      expect(storedMovement?.anulado).toBe(false);
    } finally {
      await deleteUsers([member.userId]);
    }
  });

  describe('Filtros que llegan por la query string', () => {
    // Express entrega un arreglo cuando un parámetro viene repetido, así que
    // `req.query.tipo` no siempre es texto. Antes el controlador hacía
    // `String(tipo)`, que sobre un arreglo devuelve "A,B" sin fallar: el
    // filtro seguía camino con un valor que nadie había escrito.
    it('acepta un filtro normal', async () => {
      const admin = await createAdmin();
      createdUserIds.push(admin.userId);

      const response = await request(app)
        .get('/caja/movimientos?tipo=INGRESO')
        .set('Cookie', admin.cookie);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });

    it('rechaza un parámetro repetido en vez de pegar los valores', async () => {
      const admin = await createAdmin();
      createdUserIds.push(admin.userId);

      const response = await request(app)
        .get('/caja/movimientos?tipo=INGRESO&tipo=EGRESO')
        .set('Cookie', admin.cookie);

      expect(response.status).toBe(400);
      expect(response.body.message).toMatch(/vino repetido/);
    });

    it('rechaza una búsqueda repetida, que antes buscaba el texto "a,b"', async () => {
      const admin = await createAdmin();
      createdUserIds.push(admin.userId);

      const response = await request(app)
        .get('/caja/movimientos?buscar=a&buscar=b')
        .set('Cookie', admin.cookie);

      expect(response.status).toBe(400);
      expect(response.body.message).toMatch(/vino repetido/);
    });

    it('rechaza un tipo que no existe', async () => {
      const admin = await createAdmin();
      createdUserIds.push(admin.userId);

      const response = await request(app)
        .get('/caja/movimientos?tipo=CUALQUIERA')
        .set('Cookie', admin.cookie);

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('El tipo de movimiento no es válido');
    });

    it('rechaza una fecha que no es una fecha', async () => {
      const admin = await createAdmin();
      createdUserIds.push(admin.userId);

      const response = await request(app)
        .get('/caja/movimientos?desde=no-es-una-fecha')
        .set('Cookie', admin.cookie);

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('La fecha desde no es válida');
    });

    it('ignora un parámetro vacío en lugar de tratarlo como un filtro', async () => {
      const admin = await createAdmin();
      createdUserIds.push(admin.userId);

      const response = await request(app)
        .get('/caja/movimientos?buscar=&tipo=')
        .set('Cookie', admin.cookie);

      expect(response.status).toBe(200);
    });

    it('con el parser "simple" una clave con corchetes queda literal y no se interpreta', async () => {
      // Esto es lo que vuelve inofensivo `?desde[x]=1`: con el parser
      // `extended` llegaría un objeto, pero con `simple` la clave entera es
      // "desde[x]", así que `desde` simplemente no viene y el filtro no se
      // aplica. El parser está fijado en app.ts justamente para que siga así.
      const admin = await createAdmin();
      createdUserIds.push(admin.userId);

      const response = await request(app)
        .get('/caja/movimientos?desde[x]=1')
        .set('Cookie', admin.cookie);

      expect(response.status).toBe(200);
    });
  });
});
