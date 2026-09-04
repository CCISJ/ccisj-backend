import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';

import app from '@/app';
import { prisma } from '@/config/prisma';

describe('Usuarios', () => {
  let createdUserId: number;
  const testEmail = `usuario-test-${Date.now()}@ccisj.uy`;

  afterAll(async () => {
    if (createdUserId) {
      await prisma.usuario.deleteMany({
        where: {
          id: createdUserId,
        },
      });
    }

    await prisma.$disconnect();
  });

  it('GET /usuarios devuelve una lista de usuarios', async () => {
    const response = await request(app).get('/usuarios');

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
  });

  it('GET /usuarios/:id devuelve un usuario existente', async () => {
    const existingUser = await prisma.usuario.findFirst();

    expect(existingUser).not.toBeNull();

    const response = await request(app).get(`/usuarios/${existingUser!.id}`);

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('id', existingUser!.id);
    expect(response.body).toHaveProperty('email');
    expect(response.body).toHaveProperty('tipo');

    // La contraseña no debería exponerse
    expect(response.body).not.toHaveProperty('password');
  });

  it('GET /usuarios/:id devuelve 404 si no existe', async () => {
    const response = await request(app).get('/usuarios/999999');

    expect(response.status).toBe(404);
    expect(response.body).toHaveProperty('message');
  });

  it('GET /usuarios/:id devuelve 400 si el ID es inválido', async () => {
    const response = await request(app).get('/usuarios/abc');

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty('message', 'ID inválido');
  });

  it('POST /usuarios crea un usuario', async () => {
    const response = await request(app).post('/usuarios').send({
      email: testEmail,
      password: 'test123',
      tipo: 'POSTULANTE',
    });

    expect(response.status).toBe(201);

    expect(response.body).toHaveProperty('id');
    expect(response.body.email).toBe(testEmail);
    expect(response.body.tipo).toBe('POSTULANTE');
    expect(response.body.activo).toBe(true);

    // No devolver password
    expect(response.body).not.toHaveProperty('password');

    createdUserId = response.body.id;
  });

  it('POST /usuarios falla si faltan datos obligatorios', async () => {
    const response = await request(app)
      .post('/usuarios')
      .send({
        email: `incompleto-${Date.now()}@ccisj.uy`,
      });

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty(
      'message',
      'Faltan datos obligatorios',
    );
  });

  it('POST /usuarios falla si el email ya existe', async () => {
    const response = await request(app).post('/usuarios').send({
      email: testEmail,
      password: 'otra-password',
      tipo: 'POSTULANTE',
    });

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty(
      'message',
      'El email ya está registrado',
    );
  });

  it('PUT /usuarios/:id actualiza un usuario', async () => {
    const newEmail = `usuario-actualizado-${Date.now()}@ccisj.uy`;

    const response = await request(app).put(`/usuarios/${createdUserId}`).send({
      email: newEmail,
      tipo: 'POSTULANTE',
      activo: false,
    });

    expect(response.status).toBe(200);
    expect(response.body.email).toBe(newEmail);
    expect(response.body.tipo).toBe('POSTULANTE');
    expect(response.body.activo).toBe(false);

    expect(response.body).not.toHaveProperty('password');
  });

  it('PUT /usuarios/:id devuelve error si el usuario no existe', async () => {
    const response = await request(app)
      .put('/usuarios/999999')
      .send({
        email: `no-existe-${Date.now()}@ccisj.uy`,
      });

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty('message');
  });

  it('PUT /usuarios/:id devuelve 400 si el ID es inválido', async () => {
    const response = await request(app).put('/usuarios/abc').send({
      activo: false,
    });

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty('message', 'ID inválido');
  });

  it('DELETE /usuarios/:id elimina un usuario', async () => {
    const response = await request(app).delete(`/usuarios/${createdUserId}`);

    expect(response.status).toBe(204);

    const deletedUser = await prisma.usuario.findUnique({
      where: {
        id: createdUserId,
      },
    });

    expect(deletedUser).toBeNull();

    createdUserId = 0;
  });

  it('DELETE /usuarios/:id devuelve 404 si no existe', async () => {
    const response = await request(app).delete('/usuarios/999999');

    expect(response.status).toBe(404);
    expect(response.body).toHaveProperty('message');
  });

  it('DELETE /usuarios/:id devuelve 400 si el ID es inválido', async () => {
    const response = await request(app).delete('/usuarios/abc');

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty('message', 'ID inválido');
  });
});
