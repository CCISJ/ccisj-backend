import request from 'supertest';

import { afterAll, describe, expect, it } from 'vitest';

import app from '@/app';
import { prisma } from '@/config/prisma';

describe('Socios', () => {
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

    await prisma.$disconnect();
  });

  it('GET /socios devuelve una lista de socios', async () => {
    const response = await request(app).get('/socios');

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
  });

  it('GET /socios/:id devuelve un socio existente', async () => {
    const existingMember = await prisma.socio.findFirst();

    expect(existingMember).not.toBeNull();

    const response = await request(app).get(`/socios/${existingMember!.id}`);

    expect(response.status).toBe(200);

    expect(response.body).toHaveProperty('id', existingMember!.id);

    expect(response.body).toHaveProperty('razonSocial');
    expect(response.body).toHaveProperty('titular');
    expect(response.body).toHaveProperty('rut');
    expect(response.body).toHaveProperty('numeroBps');
    expect(response.body).toHaveProperty('usuario');
  });

  it('GET /socios/:id devuelve 404 si no existe', async () => {
    const response = await request(app).get('/socios/999999');

    expect(response.status).toBe(404);
    expect(response.body).toHaveProperty('message', 'Socio no encontrado');
  });

  it('POST /socios crea un socio y su usuario', async () => {
    const response = await request(app).post('/socios').send(testMember);

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
    const response = await request(app).post('/socios').send({
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
      .send({
        razonSocial: 'Empresa Test Actualizada SRL',
        tipo: 'DIRECTIVO',
      });

    expect(response.status).toBe(200);

    expect(response.body.razonSocial).toBe('Empresa Test Actualizada SRL');

    expect(response.body.tipo).toBe('DIRECTIVO');
  });

  it('PATCH /socios/:id devuelve 404 si no existe', async () => {
    const response = await request(app).patch('/socios/999999').send({
      razonSocial: 'Empresa inexistente',
    });

    expect(response.status).toBe(404);
    expect(response.body).toHaveProperty('message');
  });

  it('DELETE /socios/:id desactiva el socio', async () => {
    const response = await request(app).delete(`/socios/${createdMemberId}`);

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
    const response = await request(app).delete('/socios/999999');

    expect(response.status).toBe(404);

    expect(response.body).toHaveProperty('message', 'Socio no encontrado');
  });
});
