import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import app from '../src/app';
import { prisma } from '../src/config/prisma';
import { createAdmin, createMember, deleteUsers } from './session';

describe('Categories', () => {
  let admin: Awaited<ReturnType<typeof createAdmin>>;

  beforeAll(async () => {
    admin = await createAdmin();
  });

  let createdCategoryId: number;

  const categoryName = `Categoria Test ${Date.now()}`;
  const updatedName = `Categoria Actualizada ${Date.now()}`;

  afterAll(async () => {
    if (createdCategoryId) {
      await prisma.categoria.deleteMany({
        where: {
          id: createdCategoryId,
        },
      });
    }

    await deleteUsers([admin.userId]);

    await prisma.$disconnect();
  });

  it('GET /categorias devuelve una lista de categorías', async () => {
    const response = await request(app)
      .get('/categorias')
      .set('Cookie', admin.cookie);

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
  });

  it('GET /categorias/:id devuelve una categoría existente', async () => {
    const existingCategory = await prisma.categoria.findFirst();

    expect(existingCategory).not.toBeNull();

    const response = await request(app)
      .get(`/categorias/${existingCategory!.id}`)
      .set('Cookie', admin.cookie);

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('id', existingCategory!.id);
  });

  it('GET /categorias/:id devuelve 404 si no existe', async () => {
    const response = await request(app)
      .get('/categorias/999999')
      .set('Cookie', admin.cookie);

    expect(response.status).toBe(404);
  });

  it('GET /categorias/:id devuelve 400 si el ID es inválido', async () => {
    const response = await request(app)
      .get('/categorias/abc')
      .set('Cookie', admin.cookie);

    expect(response.status).toBe(400);
    expect(response.body.message).toBe('ID inválido');
  });

  it('POST /categorias crea una categoría', async () => {
    const response = await request(app)
      .post('/categorias')
      .set('Cookie', admin.cookie)
      .send({
        nombre: categoryName,
        descripcion: 'Categoría creada para testing',
      });

    expect(response.status).toBe(201);
    expect(response.body.nombre).toBe(categoryName);
    expect(response.body.activa).toBe(true);

    createdCategoryId = response.body.id;
  });

  it('POST /categorias falla si falta el nombre', async () => {
    const response = await request(app)
      .post('/categorias')
      .set('Cookie', admin.cookie)
      .send({
        descripcion: 'Sin nombre',
      });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe('El nombre es obligatorio');
  });

  it('POST /categorias falla si la categoría ya existe', async () => {
    const response = await request(app)
      .post('/categorias')
      .set('Cookie', admin.cookie)
      .send({
        nombre: categoryName,
      });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe('La categoría ya existe');
  });

  it('PATCH /categorias/:id actualiza una categoría', async () => {
    const response = await request(app)
      .patch(`/categorias/${createdCategoryId}`)
      .set('Cookie', admin.cookie)
      .send({
        nombre: updatedName,
        descripcion: 'Descripción actualizada',
        activa: false,
      });

    expect(response.status).toBe(200);
    expect(response.body.nombre).toBe(updatedName);
    expect(response.body.activa).toBe(false);
  });

  it('PATCH /categorias/:id devuelve error si no existe', async () => {
    const response = await request(app)
      .patch('/categorias/999999')
      .set('Cookie', admin.cookie)
      .send({
        nombre: 'No existe',
      });

    expect(response.status).toBe(400);
  });

  it('DELETE /categorias/:id elimina una categoría', async () => {
    const response = await request(app)
      .delete(`/categorias/${createdCategoryId}`)
      .set('Cookie', admin.cookie);

    expect(response.status).toBe(204);

    const deletedCategory = await prisma.categoria.findUnique({
      where: {
        id: createdCategoryId,
      },
    });

    expect(deletedCategory).toBeNull();

    createdCategoryId = 0;
  });

  it('DELETE /categorias/:id devuelve 404 si no existe', async () => {
    const response = await request(app)
      .delete('/categorias/999999')
      .set('Cookie', admin.cookie);

    expect(response.status).toBe(404);
  });

  describe('permisos', () => {
    let socio: Awaited<ReturnType<typeof createMember>>;

    beforeAll(async () => {
      socio = await createMember();
    });

    afterAll(async () => {
      await deleteUsers([socio.userId]);
    });

    it('GET /categorias devuelve 401 sin sesión', async () => {
      const response = await request(app).get('/categorias');

      expect(response.status).toBe(401);
    });

    it('un socio puede consultar las categorías', async () => {
      const response = await request(app)
        .get('/categorias')
        .set('Cookie', socio.cookie);

      expect(response.status).toBe(200);
    });

    it('un socio no puede crear, editar ni borrar categorías', async () => {
      const existing = await prisma.categoria.findFirst();

      const create = await request(app)
        .post('/categorias')
        .set('Cookie', socio.cookie)
        .send({ nombre: `No permitida ${Date.now()}` });

      const update = await request(app)
        .patch(`/categorias/${existing!.id}`)
        .set('Cookie', socio.cookie)
        .send({ activa: false });

      const remove = await request(app)
        .delete(`/categorias/${existing!.id}`)
        .set('Cookie', socio.cookie);

      expect(create.status).toBe(403);
      expect(update.status).toBe(403);
      expect(remove.status).toBe(403);
    });
  });
});
