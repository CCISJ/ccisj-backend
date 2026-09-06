import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';

import app from '@/app';
import { prisma } from '@/config/prisma';

describe('Offers', () => {
  let userId: number;
  let memberId: number;
  let categoryId: number;
  let secondCategoryId: number;
  let offerId: number;

  const timestamp = Date.now();

  afterAll(async () => {
    if (offerId) {
      await prisma.oferta.deleteMany({
        where: { id: offerId },
      });
    }

    if (categoryId || secondCategoryId) {
      await prisma.categoria.deleteMany({
        where: {
          id: {
            in: [categoryId, secondCategoryId].filter(Boolean),
          },
        },
      });
    }

    if (memberId) {
      await prisma.socio.deleteMany({
        where: { id: memberId },
      });
    }

    if (userId) {
      await prisma.usuario.deleteMany({
        where: { id: userId },
      });
    }

    await prisma.$disconnect();
  });

  it('prepara usuario, socio y categorías para las pruebas', async () => {
    const user = await request(app)
      .post('/usuarios')
      .send({
        email: `offer-test-${timestamp}@ccisj.uy`,
        password: 'test123',
        tipo: 'SOCIO',
      });

    expect(user.status).toBe(201);

    userId = user.body.id;

    const member = await request(app)
      .post('/socios')
      .send({
        usuarioId: userId,
        nombre: 'Empresa Offers Test',
        rut: `RUT-${timestamp}`,
        tipo: 'COMUN',
      });

    expect(member.status).toBe(201);

    memberId = member.body.id;

    const category = await request(app)
      .post('/categorias')
      .send({
        nombre: `Tecnología ${timestamp}`,
      });

    expect(category.status).toBe(201);
    categoryId = category.body.id;

    const secondCategory = await request(app)
      .post('/categorias')
      .send({
        nombre: `Administración ${timestamp}`,
      });

    expect(secondCategory.status).toBe(201);
    secondCategoryId = secondCategory.body.id;
  });

  it('POST /ofertas crea una oferta con varias categorías', async () => {
    const response = await request(app)
      .post('/ofertas')
      .send({
        socioId: memberId,
        creadaPor: userId,
        titulo: 'Oferta Test',
        descripcion: 'Oferta creada mediante tests',
        ubicacion: 'San José',
        modalidad: 'PRESENCIAL',
        cantidadVacantes: 2,
        categoriaIds: [categoryId, secondCategoryId],
      });

    expect(response.status).toBe(201);
    expect(response.body.titulo).toBe('Oferta Test');
    expect(response.body.cantidadVacantes).toBe(2);
    expect(response.body.categorias).toHaveLength(2);

    offerId = response.body.id;
  });

  it('GET /ofertas devuelve las ofertas', async () => {
    const response = await request(app).get('/ofertas');

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
  });

  it('GET /ofertas/:id devuelve una oferta', async () => {
    const response = await request(app).get(`/ofertas/${offerId}`);

    expect(response.status).toBe(200);
    expect(response.body.id).toBe(offerId);
    expect(response.body).toHaveProperty('socio');
    expect(response.body).toHaveProperty('creador');
    expect(response.body).toHaveProperty('categorias');
  });

  it('POST /ofertas falla sin categorías', async () => {
    const response = await request(app).post('/ofertas').send({
      socioId: memberId,
      creadaPor: userId,
      titulo: 'Sin categorías',
      descripcion: 'Oferta inválida',
      categoriaIds: [],
    });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe(
      'La oferta debe tener al menos una categoría',
    );
  });

  it('POST /ofertas falla con una categoría inexistente', async () => {
    const response = await request(app)
      .post('/ofertas')
      .send({
        socioId: memberId,
        creadaPor: userId,
        titulo: 'Categoría inválida',
        descripcion: 'Oferta inválida',
        categoriaIds: [999999],
      });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe('Una o más categorías no existen');
  });

  it('POST /ofertas falla con cantidad de vacantes inválida', async () => {
    const response = await request(app)
      .post('/ofertas')
      .send({
        socioId: memberId,
        creadaPor: userId,
        titulo: 'Vacantes inválidas',
        descripcion: 'Oferta inválida',
        cantidadVacantes: 0,
        categoriaIds: [categoryId],
      });

    expect(response.status).toBe(400);
  });

  it('PUT /ofertas/:id actualiza la oferta', async () => {
    const response = await request(app)
      .put(`/ofertas/${offerId}`)
      .send({
        titulo: 'Oferta Test Actualizada',
        cantidadVacantes: 4,
        estado: 'CERRADA',
        categoriaIds: [categoryId],
      });

    expect(response.status).toBe(200);
    expect(response.body.titulo).toBe('Oferta Test Actualizada');
    expect(response.body.cantidadVacantes).toBe(4);
    expect(response.body.estado).toBe('CERRADA');
    expect(response.body.categorias).toHaveLength(1);
  });

  it('GET /ofertas/:id devuelve 404 si no existe', async () => {
    const response = await request(app).get('/ofertas/999999');

    expect(response.status).toBe(404);
  });

  it('DELETE /ofertas/:id elimina la oferta', async () => {
    const response = await request(app).delete(`/ofertas/${offerId}`);

    expect(response.status).toBe(204);

    const deletedOffer = await prisma.oferta.findUnique({
      where: {
        id: offerId,
      },
    });

    expect(deletedOffer).toBeNull();

    offerId = 0;
  });

  it('DELETE /ofertas/:id devuelve 404 si no existe', async () => {
    const response = await request(app).delete('/ofertas/999999');

    expect(response.status).toBe(404);
  });
});
