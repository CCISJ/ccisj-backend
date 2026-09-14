import request from 'supertest';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import app from '@/app';
import { prisma } from '@/config/prisma';
import {
  createAdmin,
  createApplicant,
  createCategory,
  createMember,
  deleteUsers,
} from '@/test/session';

describe('Offers', () => {
  let admin: Awaited<ReturnType<typeof createAdmin>>;
  let socio: Awaited<ReturnType<typeof createMember>>;
  let otherSocio: Awaited<ReturnType<typeof createMember>>;
  let postulante: Awaited<ReturnType<typeof createApplicant>>;

  let categoryId: number;
  let secondCategoryId: number;
  let offerId: number;

  const baseOffer = () => ({
    titulo: 'Oferta Test',
    descripcion: 'Oferta creada mediante tests',
    ubicacion: 'San José',
    modalidad: 'PRESENCIAL',
    cantidadVacantes: 2,
    categoriaIds: [categoryId, secondCategoryId],
  });

  beforeAll(async () => {
    admin = await createAdmin();
    socio = await createMember();
    otherSocio = await createMember();
    postulante = await createApplicant();

    categoryId = (await createCategory()).id;
    secondCategoryId = (await createCategory()).id;
  });

  afterAll(async () => {
    // deleteUsers borra también las ofertas de los socios de prueba.
    await deleteUsers([
      admin.userId,
      socio.userId,
      otherSocio.userId,
      postulante.userId,
    ]);

    await prisma.categoria.deleteMany({
      where: {
        id: {
          in: [categoryId, secondCategoryId].filter(Boolean),
        },
      },
    });

    await prisma.$disconnect();
  });

  it('POST /ofertas crea una oferta con varias categorías', async () => {
    const response = await request(app)
      .post('/ofertas')
      .set('Cookie', socio.cookie)
      .send(baseOffer());

    expect(response.status).toBe(201);

    expect(response.body.titulo).toBe('Oferta Test');
    expect(response.body.cantidadVacantes).toBe(2);
    expect(response.body.categorias).toHaveLength(2);

    offerId = response.body.id;
  });

  it('GET /ofertas devuelve las ofertas', async () => {
    const response = await request(app)
      .get('/ofertas')
      .set('Cookie', postulante.cookie);

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
  });

  it('GET /ofertas/:id devuelve una oferta', async () => {
    const response = await request(app)
      .get(`/ofertas/${offerId}`)
      .set('Cookie', postulante.cookie);

    expect(response.status).toBe(200);

    expect(response.body.id).toBe(offerId);
    expect(response.body).toHaveProperty('socio');
    expect(response.body).toHaveProperty('creador');
    expect(response.body).toHaveProperty('categorias');
  });

  it('GET /ofertas/:id no expone datos internos de la empresa', async () => {
    const response = await request(app)
      .get(`/ofertas/${offerId}`)
      .set('Cookie', postulante.cookie);

    expect(response.body.socio).toHaveProperty('razonSocial');

    for (const hidden of ['rut', 'numeroBps', 'observaciones', 'usuarioId']) {
      expect(response.body.socio).not.toHaveProperty(hidden);
    }

    expect(response.body.creador).not.toHaveProperty('email');
  });

  it('POST /ofertas falla sin categorías', async () => {
    const response = await request(app)
      .post('/ofertas')
      .set('Cookie', socio.cookie)
      .send({ ...baseOffer(), categoriaIds: [] });

    expect(response.status).toBe(400);

    expect(response.body.message).toBe(
      'La oferta debe tener al menos una categoría',
    );
  });

  it('POST /ofertas falla con una categoría inexistente', async () => {
    const response = await request(app)
      .post('/ofertas')
      .set('Cookie', socio.cookie)
      .send({ ...baseOffer(), categoriaIds: [999999] });

    expect(response.status).toBe(400);

    expect(response.body.message).toBe('Una o más categorías no existen');
  });

  it('POST /ofertas falla con cantidad de vacantes inválida', async () => {
    const response = await request(app)
      .post('/ofertas')
      .set('Cookie', socio.cookie)
      .send({ ...baseOffer(), cantidadVacantes: 0 });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe(
      'La cantidad de vacantes debe ser mayor a 0',
    );
  });

  it('PATCH /ofertas/:id actualiza la oferta', async () => {
    const response = await request(app)
      .patch(`/ofertas/${offerId}`)
      .set('Cookie', socio.cookie)
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

  it('PATCH /ofertas/:id rechaza un estado inexistente', async () => {
    const response = await request(app)
      .patch(`/ofertas/${offerId}`)
      .set('Cookie', socio.cookie)
      .send({ estado: 'BORRADA' });

    expect(response.status).toBe(400);
  });

  it('GET /ofertas/:id devuelve 404 si no existe', async () => {
    const response = await request(app)
      .get('/ofertas/999999')
      .set('Cookie', socio.cookie);

    expect(response.status).toBe(404);
  });

  it('DELETE /ofertas/:id elimina la oferta', async () => {
    const response = await request(app)
      .delete(`/ofertas/${offerId}`)
      .set('Cookie', socio.cookie);

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
    const response = await request(app)
      .delete('/ofertas/999999')
      .set('Cookie', socio.cookie);

    expect(response.status).toBe(404);
  });

  describe('permisos', () => {
    it('GET /ofertas devuelve 401 sin sesión', async () => {
      const response = await request(app).get('/ofertas');

      expect(response.status).toBe(401);
    });

    it('un postulante no puede publicar ofertas', async () => {
      const response = await request(app)
        .post('/ofertas')
        .set('Cookie', postulante.cookie)
        .send(baseOffer());

      expect(response.status).toBe(403);
    });

    it('la oferta del socio queda a nombre de su empresa aunque el body diga otra', async () => {
      const response = await request(app)
        .post('/ofertas')
        .set('Cookie', socio.cookie)
        .send({
          ...baseOffer(),
          socioId: otherSocio.socioId,
          creadaPor: otherSocio.userId,
        });

      expect(response.status).toBe(201);
      expect(response.body.socioId).toBe(socio.socioId);
      expect(response.body.creadaPor).toBe(socio.userId);
    });

    it('un socio no edita ni borra ofertas de otra empresa', async () => {
      const foreign = await request(app)
        .post('/ofertas')
        .set('Cookie', otherSocio.cookie)
        .send(baseOffer());

      expect(foreign.status).toBe(201);

      const update = await request(app)
        .patch(`/ofertas/${foreign.body.id}`)
        .set('Cookie', socio.cookie)
        .send({ titulo: 'Oferta ajena modificada' });

      const remove = await request(app)
        .delete(`/ofertas/${foreign.body.id}`)
        .set('Cookie', socio.cookie);

      expect(update.status).toBe(404);
      expect(remove.status).toBe(404);

      const stored = await prisma.oferta.findUnique({
        where: { id: foreign.body.id },
      });

      expect(stored!.titulo).toBe('Oferta Test');
    });

    it('el administrador publica para cualquier socio indicando socioId', async () => {
      const response = await request(app)
        .post('/ofertas')
        .set('Cookie', admin.cookie)
        .send({ ...baseOffer(), socioId: otherSocio.socioId });

      expect(response.status).toBe(201);
      expect(response.body.socioId).toBe(otherSocio.socioId);
      expect(response.body.creadaPor).toBe(admin.userId);
    });

    it('el administrador edita ofertas de cualquier socio', async () => {
      const offer = await prisma.oferta.findFirst({
        where: { socioId: otherSocio.socioId },
      });

      const response = await request(app)
        .patch(`/ofertas/${offer!.id}`)
        .set('Cookie', admin.cookie)
        .send({ cantidadVacantes: 3 });

      expect(response.status).toBe(200);
      expect(response.body.cantidadVacantes).toBe(3);
    });
  });
});
