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

  const memberData = {
    razonSocial: 'Empresa Offers Test',
    titular: 'Titular Offers Test',
    giroComercial: 'Tecnología',
    tipo: 'COMUN',
    rut: `RUT-OFFER-${timestamp}`,
    numeroBps: `BPS-OFFER-${timestamp}`,
    fechaInicioEmpresa: '2020-01-01',
    fechaAfiliacion: '2026-09-01',
    direccion: '18 de Julio 123',
    ciudad: 'San José',
    celular: '099123456',
    telefono: '43421234',
    email: `offer-test-${timestamp}@ccisj.uy`,
    observaciones: 'Socio usado para tests de ofertas',
  };

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

  it('prepara socio y categorías para las pruebas', async () => {
    const member = await request(app).post('/socios').send(memberData);

    expect(member.status).toBe(201);

    memberId = member.body.socioId;

    const createdMember = await prisma.socio.findUnique({
      where: {
        id: memberId,
      },
    });

    expect(createdMember).not.toBeNull();

    userId = createdMember!.usuarioId;

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
      ubicacion: 'San José',
      modalidad: 'PRESENCIAL',
      cantidadVacantes: 1,
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
        ubicacion: 'San José',
        modalidad: 'PRESENCIAL',
        cantidadVacantes: 1,
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
        ubicacion: 'San José',
        modalidad: 'PRESENCIAL',
        cantidadVacantes: 0,
        categoriaIds: [categoryId],
      });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe(
      'La cantidad de vacantes debe ser mayor a 0',
    );
  });

  it('PATCH /ofertas/:id actualiza la oferta', async () => {
    const response = await request(app)
      .patch(`/ofertas/${offerId}`)
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
