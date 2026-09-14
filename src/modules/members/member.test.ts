import request from 'supertest';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import app from '@/app';
import { prisma } from '@/config/prisma';
import {
  createAdmin,
  createApplicant,
  createMember,
  deleteUsers,
} from '@/test/session';

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
    numeroBps: `BPS-${timestamp}`,
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
        numeroBps: `OTRO-BPS-${timestamp}`,
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

  it('POST /socios falla si el email ya existe', async () => {
    const response = await request(app)
      .post('/socios')
      .set('Cookie', admin.cookie)
      .send({
        ...testMember,
        rut: `EMAIL-RUT-${timestamp}`,
        numeroBps: `EMAIL-BPS-${timestamp}`,
      });

    expect(response.status).toBe(400);

    expect(response.body).toHaveProperty(
      'message',
      'El email ya está registrado',
    );
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
});
