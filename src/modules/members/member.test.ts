import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';

import app from '@/app';
import { prisma } from '@/config/prisma';

describe('socios', () => {
  let createdUserId: number;
  let createdMemberId: number;

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
    expect(response.body).toHaveProperty('nombre');
    expect(response.body).toHaveProperty('rut');
  });

  it('GET /socios/:id devuelve 404 si no existe', async () => {
    const response = await request(app).get('/socios/999999');

    expect(response.status).toBe(404);
    expect(response.body).toHaveProperty('message');
  });

  it('POST /socios crea un socio', async () => {
    const userResponse = await request(app)
      .post('/usuarios')
      .send({
        email: `member-test-${Date.now()}@ccisj.uy`,
        password: 'test123',
        tipo: 'SOCIO',
      });

    expect(userResponse.status).toBe(201);

    createdUserId = userResponse.body.id;

    const response = await request(app)
      .post('/socios')
      .send({
        usuarioId: createdUserId,
        nombre: 'Empresa Test',
        rut: `TEST-${Date.now()}`,
        email: 'empresa-test@ccisj.uy',
        telefono: '099999999',
        direccion: 'San José',
        tipo: 'COMUN',
      });

    expect(response.status).toBe(201);

    expect(response.body).toHaveProperty('id');
    expect(response.body.nombre).toBe('Empresa Test');
    expect(response.body.tipo).toBe('COMUN');

    createdMemberId = response.body.id;
  });

  it('POST /socios falla si el usuario no existe', async () => {
    const response = await request(app)
      .post('/socios')
      .send({
        usuarioId: 999999,
        nombre: 'Empresa inválida',
        rut: `INVALID-${Date.now()}`,
        tipo: 'COMUN',
      });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe('Usuario no encontrado');
  });

  it('POST /socios falla si el usuario no es SOCIO', async () => {
    const userResponse = await request(app)
      .post('/usuarios')
      .send({
        email: `postulante-test-${Date.now()}@ccisj.uy`,
        password: 'test123',
        tipo: 'POSTULANTE',
      });

    expect(userResponse.status).toBe(201);

    const postulanteUserId = userResponse.body.id;

    const response = await request(app)
      .post('/socios')
      .send({
        usuarioId: postulanteUserId,
        nombre: 'Empresa inválida',
        rut: `INVALID-TYPE-${Date.now()}`,
        tipo: 'COMUN',
      });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe('El usuario debe ser de tipo SOCIO');

    await prisma.usuario.delete({
      where: {
        id: postulanteUserId,
      },
    });
  });

  it('PUT /socios/:id actualiza un socio', async () => {
    const response = await request(app).put(`/socios/${createdMemberId}`).send({
      nombre: 'Empresa Test Actualizada',
      tipo: 'DIRECTIVO',
      activo: true,
    });

    expect(response.status).toBe(200);
    expect(response.body.nombre).toBe('Empresa Test Actualizada');
    expect(response.body.tipo).toBe('DIRECTIVO');
  });

  it('PUT /socios/:id devuelve error si no existe', async () => {
    const response = await request(app).put('/socios/999999').send({
      nombre: 'No existe',
    });

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty('message');
  });

  it('DELETE /socios/:id elimina un socio', async () => {
    const response = await request(app).delete(`/socios/${createdMemberId}`);

    expect(response.status).toBe(204);

    const deletedMember = await prisma.socio.findUnique({
      where: {
        id: createdMemberId,
      },
    });

    expect(deletedMember).toBeNull();

    createdMemberId = 0;
  });

  it('DELETE /socios/:id devuelve 404 si no existe', async () => {
    const response = await request(app).delete('/socios/999999');

    expect(response.status).toBe(404);
    expect(response.body).toHaveProperty('message');
  });
});
