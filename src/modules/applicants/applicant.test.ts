import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';

import app from '@/app';
import { prisma } from '@/config/prisma';

describe('Applicants', () => {
  let createdUserId: number;
  let createdApplicantId: number;

  afterAll(async () => {
    if (createdApplicantId) {
      await prisma.postulante.deleteMany({
        where: {
          id: createdApplicantId,
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

  it('GET /postulantes devuelve una lista de postulantes', async () => {
    const response = await request(app).get('/postulantes');

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
  });

  it('GET /postulantes/:id devuelve un postulante existente', async () => {
    const existingApplicant = await prisma.postulante.findFirst();

    expect(existingApplicant).not.toBeNull();

    const response = await request(app).get(
      `/postulantes/${existingApplicant!.id}`,
    );

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('id', existingApplicant!.id);
    expect(response.body).toHaveProperty('nombre');
    expect(response.body).toHaveProperty('apellido');
    expect(response.body).toHaveProperty('usuario');
  });

  it('GET /postulantes/:id devuelve 404 si no existe', async () => {
    const response = await request(app).get('/postulantes/999999');

    expect(response.status).toBe(404);
    expect(response.body).toHaveProperty('message');
  });

  it('GET /postulantes/:id devuelve 400 si el ID es inválido', async () => {
    const response = await request(app).get('/postulantes/abc');

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty('message', 'ID inválido');
  });

  it('POST /postulantes crea un postulante', async () => {
    const userResponse = await request(app)
      .post('/usuarios')
      .send({
        email: `applicant-test-${Date.now()}@ccisj.uy`,
        password: 'test123',
        tipo: 'POSTULANTE',
      });

    expect(userResponse.status).toBe(201);

    createdUserId = userResponse.body.id;

    const response = await request(app).post('/postulantes').send({
      usuarioId: createdUserId,
      nombre: 'Test',
      apellido: 'Applicant',
      telefono: '099111222',
    });

    expect(response.status).toBe(201);
    expect(response.body).toHaveProperty('id');
    expect(response.body.nombre).toBe('Test');
    expect(response.body.apellido).toBe('Applicant');

    createdApplicantId = response.body.id;
  });

  it('POST /postulantes falla si faltan datos obligatorios', async () => {
    const response = await request(app).post('/postulantes').send({
      nombre: 'Incompleto',
    });

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty(
      'message',
      'Faltan datos obligatorios',
    );
  });

  it('POST /postulantes falla si el usuario no existe', async () => {
    const response = await request(app).post('/postulantes').send({
      usuarioId: 999999,
      nombre: 'Usuario',
      apellido: 'Inexistente',
    });

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty('message', 'Usuario no encontrado');
  });

  it('POST /postulantes falla si el usuario no es POSTULANTE', async () => {
    const userResponse = await request(app)
      .post('/usuarios')
      .send({
        email: `member-as-applicant-${Date.now()}@ccisj.uy`,
        password: 'test123',
        tipo: 'SOCIO',
      });

    expect(userResponse.status).toBe(201);

    const wrongUserId = userResponse.body.id;

    const response = await request(app).post('/postulantes').send({
      usuarioId: wrongUserId,
      nombre: 'Usuario',
      apellido: 'Incorrecto',
    });

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty(
      'message',
      'El usuario debe ser de tipo POSTULANTE',
    );

    await prisma.usuario.delete({
      where: {
        id: wrongUserId,
      },
    });
  });

  it('POST /postulantes falla si el usuario ya tiene postulante asociado', async () => {
    const response = await request(app).post('/postulantes').send({
      usuarioId: createdUserId,
      nombre: 'Otro',
      apellido: 'Postulante',
    });

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty(
      'message',
      'El usuario ya tiene un postulante asociado',
    );
  });

  it('PATCH /postulantes/:id actualiza un postulante', async () => {
    const response = await request(app)
      .patch(`/postulantes/${createdApplicantId}`)
      .send({
        nombre: 'Test Actualizado',
        apellido: 'Applicant',
        telefono: '098999888',
      });

    expect(response.status).toBe(200);
    expect(response.body.nombre).toBe('Test Actualizado');
    expect(response.body.telefono).toBe('098999888');
  });

  it('PATCH /postulantes/:id devuelve error si no existe', async () => {
    const response = await request(app).patch('/postulantes/999999').send({
      nombre: 'No existe',
    });

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty('message');
  });

  it('PATCH /postulantes/:id devuelve 400 si el ID es inválido', async () => {
    const response = await request(app).patch('/postulantes/abc').send({
      nombre: 'Inválido',
    });

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty('message', 'ID inválido');
  });

  it('DELETE /postulantes/:id elimina un postulante', async () => {
    const response = await request(app).delete(
      `/postulantes/${createdApplicantId}`,
    );

    expect(response.status).toBe(204);

    const deletedApplicant = await prisma.postulante.findUnique({
      where: {
        id: createdApplicantId,
      },
    });

    expect(deletedApplicant).toBeNull();

    createdApplicantId = 0;
  });

  it('DELETE /postulantes/:id devuelve 404 si no existe', async () => {
    const response = await request(app).delete('/postulantes/999999');

    expect(response.status).toBe(404);
    expect(response.body).toHaveProperty('message');
  });

  it('DELETE /postulantes/:id devuelve 400 si el ID es inválido', async () => {
    const response = await request(app).delete('/postulantes/abc');

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty('message', 'ID inválido');
  });
});
