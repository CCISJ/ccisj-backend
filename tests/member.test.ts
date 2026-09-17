import request from 'supertest';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import app from '../src/app';
import { prisma } from '../src/config/prisma';
import {
  createAdmin,
  createApplicant,
  createMember,
  deleteUsers,
  uniqueBps,
} from './session';

describe('Socios', () => {
  let admin: Awaited<ReturnType<typeof createAdmin>>;

  beforeAll(async () => {
    admin = await createAdmin();
  });

  let createdMemberId: number;
  let createdUserId: number;

  const timestamp = Date.now();

  const testMember = {
    razonSocial: 'Empresa Test SRL',
    titular: 'Juan Pérez',
    giroComercial: 'Ferretería',
    tipo: 'COMUN',
    rut: `RUT-${timestamp}`,
    numeroBps: uniqueBps(),
    fechaInicioEmpresa: '2020-01-15',
    fechaAfiliacion: '2026-09-01',
    direccion: '25 de Mayo 123',
    ciudad: 'San José',
    celular: '099123456',
    telefono: '43421234',
    email: `socio-test-${timestamp}@ccisj.uy`,
    observaciones: 'Socio creado desde test',
  };

  afterAll(async () => {
    if (createdMemberId) {
      await prisma.socio.deleteMany({
        where: {
          id: createdMemberId,
        },
      });
    }

    if (createdUserId) {
      await prisma.usuario.deleteMany({
        where: {
          id: createdUserId,
        },
      });
    }

    await deleteUsers([admin.userId]);

    await prisma.$disconnect();
  });

  it('GET /socios devuelve una lista de socios', async () => {
    const response = await request(app)
      .get('/socios')
      .set('Cookie', admin.cookie);

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
  });

  it('GET /socios/:id devuelve un socio existente', async () => {
    const existingMember = await prisma.socio.findFirst();

    expect(existingMember).not.toBeNull();

    const response = await request(app)
      .get(`/socios/${existingMember!.id}`)
      .set('Cookie', admin.cookie);

    expect(response.status).toBe(200);

    expect(response.body).toHaveProperty('id', existingMember!.id);

    expect(response.body).toHaveProperty('razonSocial');
    expect(response.body).toHaveProperty('titular');
    expect(response.body).toHaveProperty('rut');
    expect(response.body).toHaveProperty('numeroBps');
    expect(response.body).toHaveProperty('usuario');
  });

  it('GET /socios/:id devuelve 404 si no existe', async () => {
    const response = await request(app)
      .get('/socios/999999')
      .set('Cookie', admin.cookie);

    expect(response.status).toBe(404);
    expect(response.body).toHaveProperty('message', 'Socio no encontrado');
  });

  it('POST /socios crea un socio y su usuario', async () => {
    const response = await request(app)
      .post('/socios')
      .set('Cookie', admin.cookie)
      .send(testMember);

    expect(response.status).toBe(201);

    expect(response.body).toHaveProperty(
      'message',
      'Socio creado correctamente',
    );

    expect(response.body).toHaveProperty('socioId');
    expect(response.body).toHaveProperty('passwordInicial');

    expect(typeof response.body.passwordInicial).toBe('string');
    expect(response.body.passwordInicial.length).toBeGreaterThan(0);

    createdMemberId = response.body.socioId;

    const member = await prisma.socio.findUnique({
      where: {
        id: createdMemberId,
      },
      include: {
        usuario: true,
      },
    });

    expect(member).not.toBeNull();

    expect(member!.razonSocial).toBe(testMember.razonSocial);
    expect(member!.titular).toBe(testMember.titular);
    expect(member!.giroComercial).toBe(testMember.giroComercial);
    expect(member!.tipo).toBe('COMUN');
    expect(member!.rut).toBe(testMember.rut);
    expect(member!.numeroBps).toBe(testMember.numeroBps);

    expect(member!.usuario.email).toBe(testMember.email);
    expect(member!.usuario.tipo).toBe('SOCIO');
    expect(member!.usuario.activo).toBe(true);

    createdUserId = member!.usuarioId;
  });

  it('POST /socios falla si faltan datos obligatorios', async () => {
    const response = await request(app)
      .post('/socios')
      .set('Cookie', admin.cookie)
      .send({
        razonSocial: 'Empresa incompleta',
      });

    expect(response.status).toBe(400);

    expect(response.body).toHaveProperty(
      'message',
      'Faltan datos obligatorios',
    );
  });

  it('POST /socios falla si el RUT ya existe', async () => {
    const response = await request(app)
      .post('/socios')
      .set('Cookie', admin.cookie)
      .send({
        ...testMember,
        email: `otro-email-${timestamp}@ccisj.uy`,
        numeroBps: uniqueBps(),
      });

    expect(response.status).toBe(400);

    expect(response.body).toHaveProperty(
      'message',
      'El RUT ya está registrado',
    );
  });

  it('POST /socios falla si el número de BPS ya existe', async () => {
    const response = await request(app)
      .post('/socios')
      .set('Cookie', admin.cookie)
      .send({
        ...testMember,
        rut: `OTRO-RUT-${timestamp}`,
        email: `otro-bps-${timestamp}@ccisj.uy`,
      });

    expect(response.status).toBe(400);

    expect(response.body).toHaveProperty(
      'message',
      'El número de BPS ya está registrado',
    );
  });

  it('POST /socios falla si el número de BPS no tiene entre 7 y 12 dígitos', async () => {
    for (const numeroBps of [
      '123456',
      '1234567890123',
      '12345ab',
      'BPS-1234567',
    ]) {
      const response = await request(app)
        .post('/socios')
        .set('Cookie', admin.cookie)
        .send({
          ...testMember,
          rut: `BPS-RUT-${Date.now()}`,
          email: `bps-invalido-${Date.now()}@ccisj.uy`,
          numeroBps,
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty(
        'message',
        'El número de BPS debe tener entre 7 y 12 números',
      );
    }
  });

  it('PATCH /socios/:id valida el formato del número de BPS', async () => {
    const response = await request(app)
      .patch('/socios/999999')
      .set('Cookie', admin.cookie)
      .send({ numeroBps: '12-345' });

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty(
      'message',
      'El número de BPS debe tener entre 7 y 12 números',
    );
  });

  it('POST /socios falla si el email ya existe', async () => {
    const response = await request(app)
      .post('/socios')
      .set('Cookie', admin.cookie)
      .send({
        ...testMember,
        rut: `EMAIL-RUT-${timestamp}`,
        numeroBps: uniqueBps(),
      });

    expect(response.status).toBe(400);

    expect(response.body).toHaveProperty(
      'message',
      'El email ya está registrado',
    );
  });

  it('POST /socios genera una contraseña inicial que cumple las reglas y guarda el email en minúsculas', async () => {
    const suffix = Date.now();

    const response = await request(app)
      .post('/socios')
      .set('Cookie', admin.cookie)
      .send({
        ...testMember,
        rut: `PASS-RUT-${suffix}`,
        numeroBps: uniqueBps(),
        email: `Socio.Mayus-${suffix}@CCISJ.uy`,
      });

    expect(response.status).toBe(201);

    try {
      const { passwordInicial } = response.body;

      expect(passwordInicial).toMatch(/^[a-zA-Z2-9]{12}$/);
      expect(passwordInicial).toMatch(/[a-zA-Z]/);
      expect(passwordInicial).toMatch(/\d/);
      // Sin caracteres que se confunden al entregarla a mano.
      expect(passwordInicial).not.toMatch(/[01lIO]/);

      expect(response.body.email).toBe(`socio.mayus-${suffix}@ccisj.uy`);

      const login = await request(app)
        .post('/auth/login')
        .send({
          email: `socio.mayus-${suffix}@ccisj.uy`,
          password: passwordInicial,
        });

      expect(login.status).toBe(200);
    } finally {
      const member = await prisma.socio.findUnique({
        where: { id: response.body.socioId },
      });

      if (member) await deleteUsers([member.usuarioId]);
    }
  });

  it('POST /socios valida largos, teléfonos y email', async () => {
    const cases = [
      [
        { razonSocial: 'x'.repeat(151) },
        'La razón social no puede superar los 150 caracteres',
      ],
      [
        { telefono: 'llamar a Juan' },
        'El teléfono solo puede tener números, espacios, +, - y paréntesis',
      ],
      [{ email: 'no-es-un-email' }, 'El email no es válido'],
      [
        { observaciones: 'x'.repeat(2001) },
        'Las observaciones no pueden superar los 2000 caracteres',
      ],
    ] as const;

    for (const [change, message] of cases) {
      const response = await request(app)
        .post('/socios')
        .set('Cookie', admin.cookie)
        .send({ ...testMember, ...change });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe(message);
    }
  });

  it('PATCH /socios/:id actualiza un socio', async () => {
    const response = await request(app)
      .patch(`/socios/${createdMemberId}`)
      .set('Cookie', admin.cookie)
      .send({
        razonSocial: 'Empresa Test Actualizada SRL',
        tipo: 'DIRECTIVO',
      });

    expect(response.status).toBe(200);

    expect(response.body.razonSocial).toBe('Empresa Test Actualizada SRL');

    expect(response.body.tipo).toBe('DIRECTIVO');
  });

  it('PATCH /socios/:id devuelve 404 si no existe', async () => {
    const response = await request(app)
      .patch('/socios/999999')
      .set('Cookie', admin.cookie)
      .send({
        razonSocial: 'Empresa inexistente',
      });

    expect(response.status).toBe(404);
    expect(response.body).toHaveProperty('message');
  });

  it('DELETE /socios/:id desactiva el socio', async () => {
    const response = await request(app)
      .delete(`/socios/${createdMemberId}`)
      .set('Cookie', admin.cookie);

    expect(response.status).toBe(200);

    expect(response.body).toHaveProperty(
      'message',
      'Socio desactivado correctamente',
    );

    const member = await prisma.socio.findUnique({
      where: {
        id: createdMemberId,
      },
      include: {
        usuario: true,
      },
    });

    // El socio sigue existiendo
    expect(member).not.toBeNull();

    // La baja es lógica sobre Usuario
    expect(member!.usuario.activo).toBe(false);
  });

  it('DELETE /socios/:id devuelve 404 si no existe', async () => {
    const response = await request(app)
      .delete('/socios/999999')
      .set('Cookie', admin.cookie);

    expect(response.status).toBe(404);

    expect(response.body).toHaveProperty('message', 'Socio no encontrado');
  });

  it('PATCH /socios/:id ignora campos que no son del socio', async () => {
    const other = await createMember();

    try {
      const response = await request(app)
        .patch(`/socios/${other.socioId}`)
        .set('Cookie', admin.cookie)
        .send({
          telefono: '43420000',
          usuarioId: admin.userId,
          id: 1,
        });

      expect(response.status).toBe(200);

      const member = await prisma.socio.findUnique({
        where: { id: other.socioId },
      });

      expect(member!.telefono).toBe('43420000');
      expect(member!.usuarioId).toBe(other.userId);
    } finally {
      await deleteUsers([other.userId]);
    }
  });

  it('PATCH /socios/:id rechaza un número de BPS de otro socio', async () => {
    const first = await createMember();
    const second = await createMember();

    try {
      const firstMember = await prisma.socio.findUnique({
        where: { id: first.socioId },
      });

      const response = await request(app)
        .patch(`/socios/${second.socioId}`)
        .set('Cookie', admin.cookie)
        .send({ numeroBps: firstMember!.numeroBps });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty(
        'message',
        'El número de BPS ya está registrado',
      );
    } finally {
      await deleteUsers([first.userId, second.userId]);
    }
  });

  describe('permisos', () => {
    let comun: Awaited<ReturnType<typeof createMember>>;
    let directivo: Awaited<ReturnType<typeof createMember>>;
    let postulante: Awaited<ReturnType<typeof createApplicant>>;

    beforeAll(async () => {
      comun = await createMember('COMUN');
      directivo = await createMember('DIRECTIVO');
      postulante = await createApplicant();
    });

    afterAll(async () => {
      await deleteUsers([comun.userId, directivo.userId, postulante.userId]);
    });

    it('GET /socios devuelve 401 sin sesión', async () => {
      const response = await request(app).get('/socios');

      expect(response.status).toBe(401);
    });

    it('un socio común y un postulante no ven el listado de socios', async () => {
      const asComun = await request(app)
        .get('/socios')
        .set('Cookie', comun.cookie);

      const asPostulante = await request(app)
        .get(`/socios/${comun.socioId}`)
        .set('Cookie', postulante.cookie);

      expect(asComun.status).toBe(403);
      expect(asPostulante.status).toBe(403);
    });

    it('un directivo ve el directorio sin datos internos', async () => {
      const response = await request(app)
        .get('/socios')
        .set('Cookie', directivo.cookie);

      expect(response.status).toBe(200);

      const entry = response.body.find(
        (item: { id: number }) => item.id === comun.socioId,
      );

      expect(entry).toBeDefined();
      expect(entry).toHaveProperty('razonSocial');
      expect(entry).toHaveProperty('telefono');

      for (const hidden of [
        'rut',
        'numeroBps',
        'observaciones',
        'usuario',
        'usuarioId',
        'fechaInicioEmpresa',
      ]) {
        expect(entry).not.toHaveProperty(hidden);
      }
    });

    it('un directivo ve la ficha reducida y no la de socios inactivos', async () => {
      const detail = await request(app)
        .get(`/socios/${comun.socioId}`)
        .set('Cookie', directivo.cookie);

      expect(detail.status).toBe(200);
      expect(detail.body).not.toHaveProperty('rut');
      expect(detail.body).not.toHaveProperty('observaciones');

      const inactive = await createMember();

      try {
        await prisma.usuario.update({
          where: { id: inactive.userId },
          data: { activo: false },
        });

        const response = await request(app)
          .get(`/socios/${inactive.socioId}`)
          .set('Cookie', directivo.cookie);

        expect(response.status).toBe(404);
      } finally {
        await deleteUsers([inactive.userId]);
      }
    });

    it('un directivo no puede crear, editar ni dar de baja socios', async () => {
      const update = await request(app)
        .patch(`/socios/${comun.socioId}`)
        .set('Cookie', directivo.cookie)
        .send({ tipo: 'DIRECTIVO' });

      const remove = await request(app)
        .delete(`/socios/${comun.socioId}`)
        .set('Cookie', directivo.cookie);

      const create = await request(app)
        .post('/socios')
        .set('Cookie', directivo.cookie)
        .send({});

      expect(update.status).toBe(403);
      expect(remove.status).toBe(403);
      expect(create.status).toBe(403);
    });

    it('un socio no puede ascenderse a directivo por su cuenta', async () => {
      const response = await request(app)
        .patch(`/socios/${comun.socioId}`)
        .set('Cookie', comun.cookie)
        .send({ tipo: 'DIRECTIVO' });

      expect(response.status).toBe(403);

      const member = await prisma.socio.findUnique({
        where: { id: comun.socioId },
      });

      expect(member!.tipo).toBe('COMUN');
    });
  });

  describe('mi empresa (/socios/me)', () => {
    let socio: Awaited<ReturnType<typeof createMember>>;
    let other: Awaited<ReturnType<typeof createMember>>;
    let postulante: Awaited<ReturnType<typeof createApplicant>>;

    beforeAll(async () => {
      socio = await createMember();
      other = await createMember();
      postulante = await createApplicant();
    });

    afterAll(async () => {
      await deleteUsers([socio.userId, other.userId, postulante.userId]);
    });

    it('GET /socios/me devuelve la empresa del socio sin observaciones internas', async () => {
      const response = await request(app)
        .get('/socios/me')
        .set('Cookie', socio.cookie);

      expect(response.status).toBe(200);
      expect(response.body.id).toBe(socio.socioId);
      expect(response.body).toHaveProperty('rut');
      expect(response.body).toHaveProperty('numeroBps');
      expect(response.body.usuario).toEqual({ email: socio.email });

      expect(response.body).not.toHaveProperty('observaciones');
      expect(response.body).not.toHaveProperty('usuarioId');
    });

    it('/socios/me es solo para socios', async () => {
      const asAdmin = await request(app)
        .get('/socios/me')
        .set('Cookie', admin.cookie);

      const asPostulante = await request(app)
        .patch('/socios/me')
        .set('Cookie', postulante.cookie)
        .send({ telefono: '43420000' });

      const anonymous = await request(app).get('/socios/me');

      expect(asAdmin.status).toBe(403);
      expect(asPostulante.status).toBe(403);
      expect(anonymous.status).toBe(401);
    });

    it('PATCH /socios/me actualiza los datos permitidos', async () => {
      const bps = uniqueBps();

      const response = await request(app)
        .patch('/socios/me')
        .set('Cookie', socio.cookie)
        .send({
          telefono: ' 4342 5555 ',
          celular: '+598 99 123 456',
          email: 'contacto@empresa.uy',
          direccion: 'Artigas 800',
          ciudad: 'Libertad',
          numeroBps: bps,
        });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        telefono: '4342 5555',
        celular: '+598 99 123 456',
        email: 'contacto@empresa.uy',
        direccion: 'Artigas 800',
        ciudad: 'Libertad',
        numeroBps: bps,
      });
    });

    it('cambiar el email de contacto no cambia el email de acceso', async () => {
      const user = await prisma.usuario.findUnique({
        where: { id: socio.userId },
      });

      expect(user!.email).toBe(socio.email);
    });

    it('PATCH /socios/me rechaza campos que el socio no puede tocar', async () => {
      for (const body of [
        { razonSocial: 'Otra razón social' },
        { rut: '111111111111' },
        { tipo: 'DIRECTIVO' },
        { observaciones: 'Sin deudas' },
        { usuarioId: other.userId },
        { telefono: '43420000', fechaAfiliacion: '2000-01-01' },
        { toString: 'x' },
      ]) {
        const response = await request(app)
          .patch('/socios/me')
          .set('Cookie', socio.cookie)
          .send(body);

        expect(response.status).toBe(400);
      }

      const member = await prisma.socio.findUnique({
        where: { id: socio.socioId },
      });

      expect(member!.tipo).toBe('COMUN');
      expect(member!.usuarioId).toBe(socio.userId);
      expect(member!.telefono).toBe('4342 5555');
    });

    it('PATCH /socios/me valida el formato de cada dato', async () => {
      const cases: [Record<string, unknown>, string][] = [
        [{ telefono: '' }, 'El teléfono es obligatorio'],
        [{ ciudad: '   ' }, 'La ciudad es obligatoria'],
        [
          { celular: 'llamar de tarde' },
          'El celular solo puede tener números, espacios, +, - y paréntesis',
        ],
        [{ email: 'sin-arroba' }, 'El email de contacto no es válido'],
        [
          { numeroBps: '1234-567' },
          'El número de BPS debe tener entre 7 y 12 números',
        ],
        [
          { numeroBps: '123456' },
          'El número de BPS debe tener entre 7 y 12 números',
        ],
        [
          { numeroBps: '1234567890123' },
          'El número de BPS debe tener entre 7 y 12 números',
        ],
        [
          { direccion: 'x'.repeat(151) },
          'La dirección no puede superar los 150 caracteres',
        ],
        [{ telefono: 43420000 }, 'El teléfono es obligatorio'],
      ];

      for (const [body, message] of cases) {
        const response = await request(app)
          .patch('/socios/me')
          .set('Cookie', socio.cookie)
          .send(body);

        expect(response.status).toBe(400);
        expect(response.body).toHaveProperty('message', message);
      }
    });

    it('PATCH /socios/me no acepta el número de BPS de otra empresa', async () => {
      const takenBps = uniqueBps();

      await prisma.socio.update({
        where: { id: other.socioId },
        data: { numeroBps: takenBps },
      });

      const response = await request(app)
        .patch('/socios/me')
        .set('Cookie', socio.cookie)
        .send({ numeroBps: takenBps });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty(
        'message',
        'El número de BPS ya está registrado',
      );
    });

    it('PATCH /socios/me solo modifica la empresa del socio de la sesión', async () => {
      const before = await prisma.socio.findUnique({
        where: { id: other.socioId },
      });

      await request(app)
        .patch('/socios/me')
        .set('Cookie', socio.cookie)
        .send({ telefono: '43429999' })
        .expect(200);

      const after = await prisma.socio.findUnique({
        where: { id: other.socioId },
      });

      expect(after!.telefono).toBe(before!.telefono);
    });

    it('un socio desactivado ya no puede editar su empresa', async () => {
      await prisma.usuario.update({
        where: { id: other.userId },
        data: { activo: false },
      });

      const response = await request(app)
        .patch('/socios/me')
        .set('Cookie', other.cookie)
        .send({ telefono: '43421111' });

      expect(response.status).toBe(401);
    });
  });

  describe('baja de socio: ofertas y postulaciones', () => {
    let empresa: Awaited<ReturnType<typeof createMember>>;
    let otraEmpresa: Awaited<ReturnType<typeof createMember>>;
    let enviada: Awaited<ReturnType<typeof createApplicant>>;
    let enRevision: Awaited<ReturnType<typeof createApplicant>>;
    let seleccionado: Awaited<ReturnType<typeof createApplicant>>;
    let noSeleccionado: Awaited<ReturnType<typeof createApplicant>>;
    let desactivado: Awaited<ReturnType<typeof createApplicant>>;

    const offers = {} as Record<
      'activa' | 'cerrada' | 'sinPostulaciones' | 'ajena',
      number
    >;

    function createOffer(
      socioId: number,
      creadaPor: number,
      titulo: string,
      estado: 'ACTIVA' | 'CERRADA' = 'ACTIVA',
    ) {
      return prisma.oferta.create({
        data: {
          socioId,
          creadaPor,
          titulo,
          descripcion: 'Oferta de prueba',
          estado,
        },
      });
    }

    function applicationsOf(ofertaId: number) {
      return prisma.postulacion.findMany({
        where: { ofertaId },
        select: { postulanteId: true, estado: true },
      });
    }

    function noticesFor(userId: number) {
      return prisma.notificacionUsuario.findMany({
        where: { usuarioId: userId },
        include: { notificacion: true },
      });
    }

    beforeAll(async () => {
      empresa = await createMember();
      otraEmpresa = await createMember();

      [enviada, enRevision, seleccionado, noSeleccionado, desactivado] =
        await Promise.all([
          createApplicant(),
          createApplicant(),
          createApplicant(),
          createApplicant(),
          createApplicant(),
        ]);

      await prisma.usuario.update({
        where: { id: desactivado.userId },
        data: { activo: false },
      });

      const activa = await createOffer(
        empresa.socioId,
        empresa.userId,
        'Cajero',
      );
      const cerrada = await createOffer(
        empresa.socioId,
        empresa.userId,
        'Repartidor',
        'CERRADA',
      );
      const sinPostulaciones = await createOffer(
        empresa.socioId,
        admin.userId,
        'Vendedor',
      );
      const ajena = await createOffer(
        otraEmpresa.socioId,
        otraEmpresa.userId,
        'Administrativo',
      );

      offers.activa = activa.id;
      offers.cerrada = cerrada.id;
      offers.sinPostulaciones = sinPostulaciones.id;
      offers.ajena = ajena.id;

      await prisma.postulacion.createMany({
        data: [
          { ofertaId: activa.id, postulanteId: enviada.postulanteId },
          {
            ofertaId: activa.id,
            postulanteId: enRevision.postulanteId,
            estado: 'EN_REVISION',
          },
          {
            ofertaId: activa.id,
            postulanteId: seleccionado.postulanteId,
            estado: 'SELECCIONADO',
          },
          {
            ofertaId: activa.id,
            postulanteId: noSeleccionado.postulanteId,
            estado: 'NO_SELECCIONADO',
          },
          { ofertaId: activa.id, postulanteId: desactivado.postulanteId },
          // Una oferta ya cerrada con una postulación sin resolver.
          {
            ofertaId: cerrada.id,
            postulanteId: enviada.postulanteId,
            estado: 'EN_REVISION',
          },
          // La otra empresa no se toca.
          { ofertaId: ajena.id, postulanteId: enviada.postulanteId },
        ],
      });

      const response = await request(app)
        .delete(`/socios/${empresa.socioId}`)
        .set('Cookie', admin.cookie);

      expect(response.status).toBe(200);
    });

    afterAll(async () => {
      // Las ofertas se borran antes que los usuarios (y con ellas sus
      // postulaciones); las notificaciones las creó la empresa.
      await deleteUsers([empresa.userId, otraEmpresa.userId]);
      await deleteUsers([
        enviada.userId,
        enRevision.userId,
        seleccionado.userId,
        noSeleccionado.userId,
        desactivado.userId,
      ]);
    });

    it('cierra las ofertas activas de la empresa y no las de otras', async () => {
      const estados = await prisma.oferta.findMany({
        where: { id: { in: Object.values(offers) } },
        select: { id: true, estado: true },
      });

      const byId = new Map(estados.map((o) => [o.id, o.estado]));

      expect(byId.get(offers.activa)).toBe('CERRADA');
      expect(byId.get(offers.cerrada)).toBe('CERRADA');
      expect(byId.get(offers.sinPostulaciones)).toBe('CERRADA');
      expect(byId.get(offers.ajena)).toBe('ACTIVA');
    });

    it('finaliza solo las postulaciones sin resolver', async () => {
      const activa = new Map(
        (await applicationsOf(offers.activa)).map((a) => [
          a.postulanteId,
          a.estado,
        ]),
      );

      expect(activa.get(enviada.postulanteId)).toBe('FINALIZADA');
      expect(activa.get(enRevision.postulanteId)).toBe('FINALIZADA');
      expect(activa.get(desactivado.postulanteId)).toBe('FINALIZADA');
      expect(activa.get(seleccionado.postulanteId)).toBe('SELECCIONADO');
      expect(activa.get(noSeleccionado.postulanteId)).toBe('NO_SELECCIONADO');

      expect(await applicationsOf(offers.cerrada)).toEqual([
        { postulanteId: enviada.postulanteId, estado: 'FINALIZADA' },
      ]);

      expect(await applicationsOf(offers.ajena)).toEqual([
        { postulanteId: enviada.postulanteId, estado: 'ENVIADA' },
      ]);
    });

    it('avisa a cada postulante activo una vez por oferta finalizada', async () => {
      const notices = await noticesFor(enviada.userId);

      expect(notices).toHaveLength(2);

      const mensajes = notices.map((n) => n.notificacion.mensaje).sort();

      expect(mensajes[0]).toContain('«Cajero»');
      expect(mensajes[1]).toContain('«Repartidor»');

      for (const notice of notices) {
        expect(notice.leida).toBe(false);
        expect(notice.notificacion.titulo).toBe('Tu postulación: Finalizada');
        expect(notice.notificacion.creadoPorId).toBe(empresa.userId);
        // No se cuenta que la empresa se dio de baja.
        expect(notice.notificacion.mensaje).not.toMatch(/baja/i);
      }

      expect(await noticesFor(enRevision.userId)).toHaveLength(1);
    });

    it('no avisa a quien no cambió de estado ni a postulantes desactivados', async () => {
      expect(await noticesFor(seleccionado.userId)).toHaveLength(0);
      expect(await noticesFor(noSeleccionado.userId)).toHaveLength(0);
      expect(await noticesFor(desactivado.userId)).toHaveLength(0);
    });

    it('el aviso no aparece entre las notificaciones del admin', async () => {
      const response = await request(app)
        .get('/notificaciones')
        .set('Cookie', admin.cookie);

      expect(response.status).toBe(200);

      const creators = (response.body as { creadoPorId?: number }[]).map(
        (n) => n.creadoPorId,
      );

      expect(creators).not.toContain(empresa.userId);
    });

    it('repetir la baja no duplica avisos ni cambia nada más', async () => {
      const response = await request(app)
        .delete(`/socios/${empresa.socioId}`)
        .set('Cookie', admin.cookie);

      expect(response.status).toBe(200);
      expect(await noticesFor(enviada.userId)).toHaveLength(2);
      expect(await noticesFor(enRevision.userId)).toHaveLength(1);
    });
  });
});
