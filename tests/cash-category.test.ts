import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import app from '../src/app';
import { prisma } from '../src/config/prisma';
import { createAdmin, createMember, deleteUsers } from './session';

describe('Categorías de Caja', () => {
  let admin: Awaited<ReturnType<typeof createAdmin>>;
  let socio: Awaited<ReturnType<typeof createMember>>;

  const createdCategoryIds: number[] = [];

  beforeAll(async () => {
    admin = await createAdmin();
    socio = await createMember();
  });

  afterAll(async () => {
    if (createdCategoryIds.length) {
      await prisma.categoriaCaja.deleteMany({
        where: {
          id: { in: createdCategoryIds },
        },
      });
    }

    await deleteUsers([admin.userId, socio.userId]);
  });

  it('ADMIN puede listar las categorías de caja', async () => {
    const response = await request(app)
      .get('/caja/categorias')
      .set('Cookie', admin.cookie);

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);

    expect(
      response.body.some(
        (category: { nombre: string; tipo: string }) =>
          category.nombre === 'Cuotas de socios' && category.tipo === 'INGRESO',
      ),
    ).toBe(true);
  });

  it('ADMIN puede crear una categoría de ingreso', async () => {
    const response = await request(app)
      .post('/caja/categorias')
      .set('Cookie', admin.cookie)
      .send({
        nombre: 'Alquiler de salón test',
        tipo: 'INGRESO',
      });

    expect(response.status).toBe(201);

    expect(response.body).toMatchObject({
      nombre: 'Alquiler de salón test',
      tipo: 'INGRESO',
      activa: true,
    });

    createdCategoryIds.push(response.body.id);
  });

  it('permite el mismo nombre para tipos diferentes', async () => {
    const income = await request(app)
      .post('/caja/categorias')
      .set('Cookie', admin.cookie)
      .send({
        nombre: 'Servicios test',
        tipo: 'INGRESO',
      });

    const expense = await request(app)
      .post('/caja/categorias')
      .set('Cookie', admin.cookie)
      .send({
        nombre: 'Servicios test',
        tipo: 'EGRESO',
      });

    expect(income.status).toBe(201);
    expect(expense.status).toBe(201);

    createdCategoryIds.push(income.body.id, expense.body.id);
  });

  it('no permite duplicar nombre y tipo', async () => {
    const first = await request(app)
      .post('/caja/categorias')
      .set('Cookie', admin.cookie)
      .send({
        nombre: 'Eventos test',
        tipo: 'INGRESO',
      });

    expect(first.status).toBe(201);
    createdCategoryIds.push(first.body.id);

    const duplicate = await request(app)
      .post('/caja/categorias')
      .set('Cookie', admin.cookie)
      .send({
        nombre: 'Eventos test',
        tipo: 'INGRESO',
      });

    expect(duplicate.status).toBe(400);
    expect(duplicate.body.message).toBe(
      'Ya existe una categoría con ese nombre y tipo',
    );
  });

  it('ADMIN puede desactivar una categoría', async () => {
    const created = await request(app)
      .post('/caja/categorias')
      .set('Cookie', admin.cookie)
      .send({
        nombre: 'Categoría para eliminar test',
        tipo: 'EGRESO',
      });

    expect(created.status).toBe(201);
    createdCategoryIds.push(created.body.id);

    const response = await request(app)
      .delete(`/caja/categorias/${created.body.id}`)
      .set('Cookie', admin.cookie);

    expect(response.status).toBe(200);
    expect(response.body.activa).toBe(false);

    const category = await prisma.categoriaCaja.findUnique({
      where: { id: created.body.id },
    });

    expect(category).not.toBeNull();
    expect(category!.activa).toBe(false);
  });

  it('no permite eliminar la categoría Cuotas de socios', async () => {
    const category = await prisma.categoriaCaja.findUnique({
      where: {
        nombre_tipo: {
          nombre: 'Cuotas de socios',
          tipo: 'INGRESO',
        },
      },
    });

    expect(category).not.toBeNull();

    const response = await request(app)
      .delete(`/caja/categorias/${category!.id}`)
      .set('Cookie', admin.cookie);

    expect(response.status).toBe(400);
    expect(response.body.message).toBe(
      'La categoría de cuotas de socios no se puede eliminar',
    );
  });

  it('SOCIO no puede administrar categorías de caja', async () => {
    const getResponse = await request(app)
      .get('/caja/categorias')
      .set('Cookie', socio.cookie);

    const postResponse = await request(app)
      .post('/caja/categorias')
      .set('Cookie', socio.cookie)
      .send({
        nombre: 'No autorizada test',
        tipo: 'INGRESO',
      });

    expect(getResponse.status).toBe(403);
    expect(postResponse.status).toBe(403);
  });

  it('rechaza un tipo de categoría inválido', async () => {
    const response = await request(app)
      .post('/caja/categorias')
      .set('Cookie', admin.cookie)
      .send({
        nombre: 'Categoría inválida test',
        tipo: 'OTRO',
      });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe('El tipo de categoría no es válido');
  });

  it('no muestra el error interno cuando algo falla de forma inesperada', async () => {
    // Un nombre numérico rompe el `.trim()` del service con un TypeError.
    // Antes la respuesta traía ese mensaje tal cual
    // ("data.nombre?.trim is not a function").
    const response = await request(app)
      .post('/caja/categorias')
      .set('Cookie', admin.cookie)
      .send({
        nombre: 123,
        tipo: 'INGRESO',
      });

    expect(response.status).toBe(500);
    expect(response.body.message).toBe('Error al crear la categoría');
  });
});
