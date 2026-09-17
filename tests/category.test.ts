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

    expect(response.status).toBe(404);
    expect(response.body.message).toBe('Categoría no encontrada');
  });

  it('POST /categorias no deja fijar campos que no son del alta', async () => {
    const response = await request(app)
      .post('/categorias')
      .set('Cookie', admin.cookie)
      .send({
        id: 999999,
        nombre: `Categoria Campos ${Date.now()}`,
        activa: false,
      });

    try {
      expect(response.status).toBe(201);
      expect(response.body.id).not.toBe(999999);
      expect(response.body.activa).toBe(true);
    } finally {
      if (response.body?.id) {
        await prisma.categoria.deleteMany({ where: { id: response.body.id } });
      }
    }
  });

  it('POST /categorias valida tipos y largos', async () => {
    const cases = [
      {
        body: { nombre: { contains: 'a' } },
        message: 'El nombre es obligatorio',
      },
      {
        body: { nombre: 'x'.repeat(101) },
        message: 'El nombre no puede superar los 100 caracteres',
      },
      {
        body: { nombre: `Larga ${Date.now()}`, descripcion: 'x'.repeat(256) },
        message: 'La descripción no puede superar los 255 caracteres',
      },
    ];

    for (const { body, message } of cases) {
      const response = await request(app)
        .post('/categorias')
        .set('Cookie', admin.cookie)
        .send(body);

      expect(response.status).toBe(400);
      expect(response.body.message).toBe(message);
    }
  });

  it('el nombre repetido se detecta sin distinguir mayúsculas', async () => {
    const response = await request(app)
      .post('/categorias')
      .set('Cookie', admin.cookie)
      .send({ nombre: `  ${updatedName.toUpperCase()} ` });

    expect(response.status).toBe(400);
    // La del test anterior quedó desactivada.
    expect(response.body.message).toBe(
      'La categoría ya existe y está desactivada: reactivala en lugar de crear otra',
    );
  });

  it('DELETE /categorias/:id desactiva la categoría en vez de borrarla', async () => {
    await prisma.categoria.update({
      where: { id: createdCategoryId },
      data: { activa: true },
    });

    const response = await request(app)
      .delete(`/categorias/${createdCategoryId}`)
      .set('Cookie', admin.cookie);

    expect(response.status).toBe(204);

    const category = await prisma.categoria.findUnique({
      where: {
        id: createdCategoryId,
      },
    });

    expect(category).not.toBeNull();
    expect(category!.activa).toBe(false);

    const reactivated = await request(app)
      .patch(`/categorias/${createdCategoryId}`)
      .set('Cookie', admin.cookie)
      .send({ activa: true });

    expect(reactivated.status).toBe(200);
    expect(reactivated.body.activa).toBe(true);
  });

  it('desactivar una categoría no la quita de las ofertas que la tienen', async () => {
    const member = await createMember();

    try {
      const offer = await prisma.oferta.create({
        data: {
          socioId: member.socioId,
          creadaPor: member.userId,
          titulo: 'Oferta con categoría',
          descripcion: 'Oferta de prueba',
          categorias: { create: { categoriaId: createdCategoryId } },
        },
      });

      const response = await request(app)
        .delete(`/categorias/${createdCategoryId}`)
        .set('Cookie', admin.cookie);

      expect(response.status).toBe(204);

      const links = await prisma.ofertaCategoria.count({
        where: { ofertaId: offer.id, categoriaId: createdCategoryId },
      });

      expect(links).toBe(1);
    } finally {
      await deleteUsers([member.userId]);
    }
  });

  it('DELETE /categorias/:id devuelve 404 si no existe', async () => {
    const response = await request(app)
      .delete('/categorias/999999')
      .set('Cookie', admin.cookie);

    expect(response.status).toBe(404);
  });

  it('un ID que no es entero se rechaza sin llegar a la base', async () => {
    for (const id of ['1.5', '0', '-1']) {
      const response = await request(app)
        .delete(`/categorias/${id}`)
        .set('Cookie', admin.cookie);

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('ID inválido');
    }
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
