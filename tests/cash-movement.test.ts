import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

import app from '../src/app';
import { prisma } from '../src/config/prisma';
import type { MovimientoCaja } from '../src/generated/prisma/client';
import {
  addManualCashMovement,
  cancelManualCashMovement,
  getCashMovements,
  getCurrentMonthCashSummary,
} from '../src/modules/cash-movement/cash-movement.service';
import {
  createAdmin,
  createMember,
  deleteMemberPayments,
  deleteUsers,
  uniqueSuffix,
} from './session';
import { storageFalso } from './storage-falso';

// Supabase Storage se reemplaza por uno en memoria (ver storage-falso.ts).
vi.mock('../src/config/supabase', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('../src/config/supabase')>();
  const { supabaseFalso } = await import('./storage-falso.js');

  return { ...original, getSupabase: () => supabaseFalso };
});

const storage = storageFalso;

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

  // H-16: `%` y `_` funcionaban como comodines en la búsqueda: buscar `%`
  // traía todos los movimientos.
  it('busca el texto literal aunque tenga comodines', async () => {
    const admin = await createAdmin();
    createdUserIds.push(admin.userId);

    const category = await createCategory('INGRESO');
    const uniqueText = `Comodin-${uniqueSuffix()}`;

    const conPorcentaje = await createTrackedMovement({
      tipo: 'INGRESO',
      categoriaId: category.id,
      concepto: `${uniqueText} recargo 10%`,
      importe: 100,
      fecha: new Date('2026-08-10'),
      registradoPorId: admin.userId,
    });

    const sinPorcentaje = await createTrackedMovement({
      tipo: 'INGRESO',
      categoriaId: category.id,
      concepto: `${uniqueText} recargo 10 pesos`,
      importe: 100,
      fecha: new Date('2026-08-10'),
      registradoPorId: admin.userId,
    });

    const ids = (
      await getCashMovements({ buscar: `${uniqueText} recargo 10%` })
    ).map((movement: MovimientoCaja) => movement.id);

    expect(ids).toContain(conPorcentaje.id);
    expect(ids).not.toContain(sinPorcentaje.id);
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

  it('en la noche del último día del mes, el resumen sigue siendo de ese mes', async () => {
    // El 31/03 a las 22 de Uruguay ya es abril en UTC: el resumen pasaba a
    // abril y no mostraba lo registrado ese día. Ningún otro test usa 2031.
    const admin = await createAdmin();
    createdUserIds.push(admin.userId);

    const category = await createCategory('INGRESO');

    await createTrackedMovement({
      tipo: 'INGRESO',
      categoriaId: category.id,
      concepto: `Último día del mes ${uniqueSuffix()}`,
      importe: 4321,
      fecha: new Date('2031-03-31'),
      registradoPorId: admin.userId,
    });

    const summary = await getCurrentMonthCashSummary(
      new Date('2031-03-31T22:00:00-03:00'),
    );

    expect(summary.ingresos).toBe(4321);
    expect(summary.cantidadMovimientos).toBe(1);
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

  it('anular un movimiento que no existe responde 404', async () => {
    const admin = await createAdmin();
    createdUserIds.push(admin.userId);

    const response = await request(app)
      .patch('/caja/movimientos/2000000000/anular')
      .set('Cookie', admin.cookie)
      .send({ motivo: 'No existe' });

    expect(response.status).toBe(404);
    expect(response.body.message).toBe('El movimiento no existe');
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

  it('un id de categoría fuera de rango responde 400 sin mostrar el error de la base', async () => {
    // Un id de categoría que no entra en un entero de la base pasa la
    // validación del service y lo rechaza Prisma. Antes la respuesta traía el
    // mensaje de Prisma entero: la ruta del archivo en el servidor, las líneas
    // del código y la consulta. Después fue un 500 genérico, y desde el
    // escaneo de ZAP es un 400 que dice qué pasó.
    const admin = await createAdmin();
    createdUserIds.push(admin.userId);

    const response = await request(app)
      .post('/caja/movimientos')
      .set('Cookie', admin.cookie)
      .send({
        tipo: 'INGRESO',
        categoriaId: 99999999999,
        concepto: 'Movimiento test',
        importe: 100,
        fecha: '2026-10-01',
      });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      message: 'Uno de los datos está fuera de rango',
    });
  });

  describe('Filtros que llegan por la query string', () => {
    // Express entrega un arreglo cuando un parámetro viene repetido, así que
    // `req.query.tipo` no siempre es texto. Antes el controlador hacía
    // `String(tipo)`, que sobre un arreglo devuelve "A,B" sin fallar: el
    // filtro seguía camino con un valor que nadie había escrito.
    async function pedirMovimientos(query: string) {
      const admin = await createAdmin();
      createdUserIds.push(admin.userId);

      return request(app)
        .get(`/caja/movimientos${query}`)
        .set('Cookie', admin.cookie);
    }

    it('acepta un filtro normal', async () => {
      const response = await pedirMovimientos('?tipo=INGRESO');

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });

    it('rechaza un parámetro repetido en vez de pegar los valores', async () => {
      const response = await pedirMovimientos('?tipo=INGRESO&tipo=EGRESO');

      expect(response.status).toBe(400);
      expect(response.body.message).toMatch(/vino repetido/);
    });

    it('rechaza una búsqueda repetida, que antes buscaba el texto "a,b"', async () => {
      const response = await pedirMovimientos('?buscar=a&buscar=b');

      expect(response.status).toBe(400);
      expect(response.body.message).toMatch(/vino repetido/);
    });

    it('rechaza un tipo que no existe', async () => {
      const response = await pedirMovimientos('?tipo=CUALQUIERA');

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('El tipo de movimiento no es válido');
    });

    it('rechaza una fecha que no es una fecha', async () => {
      const response = await pedirMovimientos('?desde=no-es-una-fecha');

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('La fecha desde no es válida');
    });

    it('ignora un parámetro vacío en lugar de tratarlo como un filtro', async () => {
      const response = await pedirMovimientos('?buscar=&tipo=');

      expect(response.status).toBe(200);
    });

    it('con el parser "simple" una clave con corchetes queda literal y no se interpreta', async () => {
      // Esto es lo que vuelve inofensivo `?desde[x]=1`: con el parser
      // `extended` llegaría un objeto, pero con `simple` la clave entera es
      // "desde[x]", así que `desde` simplemente no viene y el filtro no se
      // aplica. El parser está fijado en app.ts justamente para que siga así.
      const response = await pedirMovimientos('?desde[x]=1');

      expect(response.status).toBe(200);
    });
  });

  describe('Comprobantes', () => {
    const PDF = Buffer.from('%PDF-1.7\nComprobante de prueba');
    const PNG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);
    const pdf = { filename: 'comprobante.pdf', contentType: 'application/pdf' };

    beforeEach(() => {
      storage.reset();
    });

    async function createMovementWithAdmin() {
      const admin = await createAdmin();
      createdUserIds.push(admin.userId);

      const category = await createCategory('INGRESO');

      const movement = await createTrackedMovement({
        tipo: 'INGRESO',
        categoriaId: category.id,
        concepto: 'Movimiento con comprobante',
        importe: 100,
        fecha: new Date('2026-10-01'),
        registradoPorId: admin.userId,
      });

      return { admin, movement };
    }

    function upload(
      cookie: string[],
      id: number,
      file: Buffer,
      options: { filename: string; contentType: string; field?: string },
    ) {
      return request(app)
        .post(`/caja/movimientos/${id}/comprobante`)
        .set('Cookie', cookie)
        .attach(options.field ?? 'comprobante', file, {
          filename: options.filename,
          contentType: options.contentType,
        });
    }

    it('guarda el comprobante y lo deja asociado al movimiento', async () => {
      const { admin, movement } = await createMovementWithAdmin();

      const response = await upload(admin.cookie, movement.id, PDF, pdf);

      expect(response.status).toBe(200);
      expect(response.body.comprobanteUrl).toMatch(
        new RegExp(`^movimientos/${movement.id}/[0-9a-f-]{36}\\.pdf$`),
      );
      expect(storage.files.get(response.body.comprobanteUrl)).toBe(
        'application/pdf',
      );

      const stored = await prisma.movimientoCaja.findUnique({
        where: { id: movement.id },
      });

      expect(stored?.comprobanteUrl).toBe(response.body.comprobanteUrl);
    });

    it('al reemplazarlo borra el anterior de Storage', async () => {
      const { admin, movement } = await createMovementWithAdmin();

      const first = await upload(admin.cookie, movement.id, PDF, pdf);
      const second = await upload(admin.cookie, movement.id, PNG, {
        filename: 'foto.png',
        contentType: 'image/png',
      });

      expect(second.status).toBe(200);
      expect(second.body.comprobanteUrl).not.toBe(first.body.comprobanteUrl);
      expect([...storage.files.keys()]).toEqual([second.body.comprobanteUrl]);
    });

    it('decide el tipo por el contenido y no por lo que declara el archivo', async () => {
      // El tipo declarado lo elige quien sube el archivo: un texto que dice
      // ser PNG pasa el primer filtro, pero no el de los bytes del contenido.
      const { admin, movement } = await createMovementWithAdmin();

      const response = await upload(
        admin.cookie,
        movement.id,
        Buffer.from('<script>alert(1)</script>'),
        { filename: 'foto.png', contentType: 'image/png' },
      );

      expect(response.status).toBe(400);
      expect(response.body.message).toBe(
        'El archivo no es un PDF, JPG o PNG válido',
      );
      expect(storage.files.size).toBe(0);
    });

    it('responde 413 con un mensaje claro a un archivo de más de 5 MB', async () => {
      // Antes salía como 500 "Error interno del servidor".
      const { admin, movement } = await createMovementWithAdmin();

      const big = Buffer.concat([PDF, Buffer.alloc(5 * 1024 * 1024)]);
      const response = await upload(admin.cookie, movement.id, big, pdf);

      expect(response.status).toBe(413);
      expect(response.body.message).toBe(
        'El comprobante no puede superar los 5 MB',
      );
      expect(storage.files.size).toBe(0);
    });

    it('responde 400 a un tipo de archivo no permitido', async () => {
      const { admin, movement } = await createMovementWithAdmin();

      const response = await upload(admin.cookie, movement.id, PDF, {
        filename: 'programa.exe',
        contentType: 'application/x-msdownload',
      });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe(
        'Solo se permiten archivos PDF, JPG y PNG',
      );
    });

    it('responde 400 si el archivo llega en otro campo', async () => {
      const { admin, movement } = await createMovementWithAdmin();

      const response = await upload(admin.cookie, movement.id, PDF, {
        ...pdf,
        field: 'archivo',
      });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe(
        'Se espera un único archivo, en el campo "comprobante"',
      );
    });

    it('responde 400 si el envío llega cortado', async () => {
      const { admin, movement } = await createMovementWithAdmin();

      const response = await request(app)
        .post(`/caja/movimientos/${movement.id}/comprobante`)
        .set('Cookie', admin.cookie)
        .set('Content-Type', 'multipart/form-data; boundary=XYZ')
        .send(
          '--XYZ\r\nContent-Disposition: form-data; name="comprobante"; ' +
            'filename="a.pdf"\r\nContent-Type: application/pdf\r\n\r\n%PDF-1',
        );

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('No se pudo leer el archivo enviado');
    });

    it('responde 400 si no llega ningún archivo', async () => {
      const { admin, movement } = await createMovementWithAdmin();

      const response = await request(app)
        .post(`/caja/movimientos/${movement.id}/comprobante`)
        .set('Cookie', admin.cookie);

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('El comprobante es obligatorio');
    });

    it('no adjunta un comprobante a un movimiento anulado', async () => {
      const { admin, movement } = await createMovementWithAdmin();

      await cancelManualCashMovement(movement.id, admin.userId, 'Error');

      const response = await upload(admin.cookie, movement.id, PDF, pdf);

      expect(response.status).toBe(400);
      expect(response.body.message).toBe(
        'No se puede adjuntar un comprobante a un movimiento anulado',
      );
      expect(storage.files.size).toBe(0);
    });

    it('responde 404 a un movimiento que no existe, al subir y al ver', async () => {
      const admin = await createAdmin();
      createdUserIds.push(admin.userId);

      const uploaded = await upload(admin.cookie, 2147483647, PDF, pdf);
      const viewed = await request(app)
        .get('/caja/movimientos/2147483647/comprobante')
        .set('Cookie', admin.cookie);

      expect(uploaded.status).toBe(404);
      expect(viewed.status).toBe(404);
      expect(viewed.body.message).toBe('El movimiento no existe');
    });

    it('un id que no entra en un entero responde 400 sin mostrar el error de la base', async () => {
      // Antes la respuesta traía la ruta del archivo en el servidor, las
      // líneas del código y la consulta de Prisma; después, un 500 genérico.
      const admin = await createAdmin();
      createdUserIds.push(admin.userId);

      const response = await upload(admin.cookie, 2147483648, PDF, pdf);

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        message: 'Uno de los datos está fuera de rango',
      });
    });

    it('no muestra el error de Storage cuando falla', async () => {
      const { admin, movement } = await createMovementWithAdmin();
      storage.failing = true;

      const response = await upload(admin.cookie, movement.id, PDF, pdf);

      expect(response.status).toBe(500);
      expect(response.body).toEqual({
        message: 'Error al subir el comprobante',
      });
    });

    it('entrega un enlace firmado que vence en un minuto', async () => {
      const { admin, movement } = await createMovementWithAdmin();

      const uploaded = await upload(admin.cookie, movement.id, PDF, pdf);
      const response = await request(app)
        .get(`/caja/movimientos/${movement.id}/comprobante`)
        .set('Cookie', admin.cookie);

      expect(response.status).toBe(200);
      expect(response.body.url).toBe(
        `https://storage.test/${uploaded.body.comprobanteUrl}?expira=60`,
      );
    });

    it('avisa si el movimiento no tiene comprobante', async () => {
      const { admin, movement } = await createMovementWithAdmin();

      const response = await request(app)
        .get(`/caja/movimientos/${movement.id}/comprobante`)
        .set('Cookie', admin.cookie);

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('El movimiento no tiene comprobante');
    });
  });
});
