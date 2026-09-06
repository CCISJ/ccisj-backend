import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';

import app from '@/app';
import { prisma } from '@/config/prisma';

describe('Categories', () => {
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

    await prisma.$disconnect();
  });

  it('GET /categorias devuelve una lista de categorías', async () => {
    const response = await request(app).get('/categorias');

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
  });

  it('GET /categorias/:id devuelve una categoría existente', async () => {
    const existingCategory = await prisma.categoria.findFirst();

    expect(existingCategory).not.toBeNull();

    const response = await request(app).get(
      `/categorias/${existingCategory!.id}`,
    );

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('id', existingCategory!.id);
  });

  it('GET /categorias/:id devuelve 404 si no existe', async () => {
    const response = await request(app).get('/categorias/999999');

    expect(response.status).toBe(404);
  });

  it('GET /categorias/:id devuelve 400 si el ID es inválido', async () => {
    const response = await request(app).get('/categorias/abc');

    expect(response.status).toBe(400);
    expect(response.body.message).toBe('ID inválido');
  });

  it('POST /categorias crea una categoría', async () => {
    const response = await request(app).post('/categorias').send({
      nombre: categoryName,
      descripcion: 'Categoría creada para testing',
    });

    expect(response.status).toBe(201);
    expect(response.body.nombre).toBe(categoryName);
    expect(response.body.activa).toBe(true);

    createdCategoryId = response.body.id;
  });

  it('POST /categorias falla si falta el nombre', async () => {
    const response = await request(app).post('/categorias').send({
      descripcion: 'Sin nombre',
    });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe('El nombre es obligatorio');
  });

  it('POST /categorias falla si la categoría ya existe', async () => {
    const response = await request(app).post('/categorias').send({
      nombre: categoryName,
    });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe('La categoría ya existe');
  });

  it('PUT /categorias/:id actualiza una categoría', async () => {
    const response = await request(app)
      .put(`/categorias/${createdCategoryId}`)
      .send({
        nombre: updatedName,
        descripcion: 'Descripción actualizada',
        activa: false,
      });

    expect(response.status).toBe(200);
    expect(response.body.nombre).toBe(updatedName);
    expect(response.body.activa).toBe(false);
  });

  it('PUT /categorias/:id devuelve error si no existe', async () => {
    const response = await request(app).put('/categorias/999999').send({
      nombre: 'No existe',
    });

    expect(response.status).toBe(400);
  });

  it('DELETE /categorias/:id elimina una categoría', async () => {
    const response = await request(app).delete(
      `/categorias/${createdCategoryId}`,
    );

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
    const response = await request(app).delete('/categorias/999999');

    expect(response.status).toBe(404);
  });
});
