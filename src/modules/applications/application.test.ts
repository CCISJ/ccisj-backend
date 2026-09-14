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

describe('Applications', () => {
  let admin: Awaited<ReturnType<typeof createAdmin>>;
  let socio: Awaited<ReturnType<typeof createMember>>;
  let otherSocio: Awaited<ReturnType<typeof createMember>>;
  let postulante: Awaited<ReturnType<typeof createApplicant>>;
  let otherPostulante: Awaited<ReturnType<typeof createApplicant>>;

  let categoryId: number;
  let offerId: number;
  let applicationId: number;

  beforeAll(async () => {
    admin = await createAdmin();
    socio = await createMember();
    otherSocio = await createMember();
    postulante = await createApplicant();
    otherPostulante = await createApplicant();

    categoryId = (await createCategory()).id;

    const offer = await request(app)
      .post('/ofertas')
      .set('Cookie', socio.cookie)
      .send({
        titulo: 'Oferta para postulaciones',
        descripcion: 'Oferta de prueba',
        ubicacion: 'San José',
        modalidad: 'PRESENCIAL',
        cantidadVacantes: 1,
        categoriaIds: [categoryId],
      });

    expect(offer.status).toBe(201);

    offerId = offer.body.id;
  });

  afterAll(async () => {
    // Las postulaciones se borran en cascada con las ofertas y los postulantes.
    await deleteUsers([
      admin.userId,
      socio.userId,
      otherSocio.userId,
      postulante.userId,
      otherPostulante.userId,
    ]);

    if (categoryId) {
      await prisma.categoria.deleteMany({
        where: { id: categoryId },
      });
    }

    await prisma.$disconnect();
  });

  it('POST /postulaciones crea una postulación', async () => {
    const response = await request(app)
      .post('/postulaciones')
      .set('Cookie', postulante.cookie)
      .send({
        ofertaId: offerId,
        observaciones: 'Postulación de prueba',
      });

    expect(response.status).toBe(201);

    expect(response.body.ofertaId).toBe(offerId);
    expect(response.body.postulanteId).toBe(postulante.postulanteId);
    expect(response.body.estado).toBe('ENVIADA');

    applicationId = response.body.id;
  });

  it('POST /postulaciones evita postularse dos veces', async () => {
    const response = await request(app)
      .post('/postulaciones')
      .set('Cookie', postulante.cookie)
      .send({
        ofertaId: offerId,
      });

    expect(response.status).toBe(400);

    expect(response.body.message).toBe(
      'El postulante ya se postuló a esta oferta',
    );
  });

  it('POST /postulaciones exige un CV cargado', async () => {
    const sinCv = await createApplicant({ withCv: false });

    try {
      const response = await request(app)
        .post('/postulaciones')
        .set('Cookie', sinCv.cookie)
        .send({ ofertaId: offerId });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe(
        'El postulante debe tener un CV cargado',
      );
    } finally {
      await deleteUsers([sinCv.userId]);
    }
  });

  it('GET /postulaciones devuelve una lista', async () => {
    const response = await request(app)
      .get('/postulaciones')
      .set('Cookie', admin.cookie);

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
  });

  it('GET /postulaciones/:id devuelve una postulación', async () => {
    const response = await request(app)
      .get(`/postulaciones/${applicationId}`)
      .set('Cookie', admin.cookie);

    expect(response.status).toBe(200);

    expect(response.body.id).toBe(applicationId);
    expect(response.body).toHaveProperty('oferta');
    expect(response.body).toHaveProperty('postulante');
  });

  it('PATCH /postulaciones/:id actualiza el estado', async () => {
    const response = await request(app)
      .patch(`/postulaciones/${applicationId}`)
      .set('Cookie', socio.cookie)
      .send({
        estado: 'EN_REVISION',
        observaciones: 'Revisando candidatura',
      });

    expect(response.status).toBe(200);

    expect(response.body.estado).toBe('EN_REVISION');
    expect(response.body.observaciones).toBe('Revisando candidatura');
  });

  it('PATCH /postulaciones/:id rechaza un estado inexistente', async () => {
    const response = await request(app)
      .patch(`/postulaciones/${applicationId}`)
      .set('Cookie', socio.cookie)
      .send({ estado: 'CONTRATADO' });

    expect(response.status).toBe(400);
  });

  it('POST /postulaciones falla si la oferta no existe', async () => {
    const response = await request(app)
      .post('/postulaciones')
      .set('Cookie', postulante.cookie)
      .send({
        ofertaId: 999999,
      });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe('Oferta no encontrada');
  });

  it('GET /postulaciones/:id devuelve 404 si no existe', async () => {
    const response = await request(app)
      .get('/postulaciones/999999')
      .set('Cookie', admin.cookie);

    expect(response.status).toBe(404);
  });

  describe('permisos', () => {
    it('GET /postulaciones devuelve 401 sin sesión', async () => {
      const response = await request(app).get('/postulaciones');

      expect(response.status).toBe(401);
    });

    it('el postulante que postula es el de la sesión, no el del body', async () => {
      const otherOffer = await request(app)
        .post('/ofertas')
        .set('Cookie', otherSocio.cookie)
        .send({
          titulo: 'Otra oferta',
          descripcion: 'Oferta de prueba',
          categoriaIds: [categoryId],
        });

      const response = await request(app)
        .post('/postulaciones')
        .set('Cookie', postulante.cookie)
        .send({
          ofertaId: otherOffer.body.id,
          postulanteId: otherPostulante.postulanteId,
        });

      expect(response.status).toBe(201);
      expect(response.body.postulanteId).toBe(postulante.postulanteId);
    });

    it('solo un postulante puede postularse', async () => {
      const asSocio = await request(app)
        .post('/postulaciones')
        .set('Cookie', socio.cookie)
        .send({ ofertaId: offerId });

      const asAdmin = await request(app)
        .post('/postulaciones')
        .set('Cookie', admin.cookie)
        .send({ ofertaId: offerId });

      expect(asSocio.status).toBe(403);
      expect(asAdmin.status).toBe(403);
    });

    it('el listado completo es solo del administrador', async () => {
      const asSocio = await request(app)
        .get('/postulaciones')
        .set('Cookie', socio.cookie);

      const asPostulante = await request(app)
        .get('/postulaciones')
        .set('Cookie', postulante.cookie);

      expect(asSocio.status).toBe(403);
      expect(asPostulante.status).toBe(403);
    });

    it('el socio dueño de la oferta y el postulante ven la postulación', async () => {
      const asOwner = await request(app)
        .get(`/postulaciones/${applicationId}`)
        .set('Cookie', socio.cookie);

      const asApplicant = await request(app)
        .get(`/postulaciones/${applicationId}`)
        .set('Cookie', postulante.cookie);

      expect(asOwner.status).toBe(200);
      expect(asApplicant.status).toBe(200);
    });

    it('otro socio u otro postulante no ven la postulación', async () => {
      const asOtherSocio = await request(app)
        .get(`/postulaciones/${applicationId}`)
        .set('Cookie', otherSocio.cookie);

      const asOtherPostulante = await request(app)
        .get(`/postulaciones/${applicationId}`)
        .set('Cookie', otherPostulante.cookie);

      expect(asOtherSocio.status).toBe(404);
      expect(asOtherPostulante.status).toBe(404);
    });

    it('otro socio no cambia el estado y el postulante tampoco', async () => {
      const asOtherSocio = await request(app)
        .patch(`/postulaciones/${applicationId}`)
        .set('Cookie', otherSocio.cookie)
        .send({ estado: 'SELECCIONADO' });

      const asApplicant = await request(app)
        .patch(`/postulaciones/${applicationId}`)
        .set('Cookie', postulante.cookie)
        .send({ estado: 'SELECCIONADO' });

      expect(asOtherSocio.status).toBe(404);
      expect(asApplicant.status).toBe(403);

      const stored = await prisma.postulacion.findUnique({
        where: { id: applicationId },
      });

      expect(stored!.estado).toBe('EN_REVISION');
    });

    it('otro postulante no puede retirar la postulación', async () => {
      const response = await request(app)
        .delete(`/postulaciones/${applicationId}`)
        .set('Cookie', otherPostulante.cookie);

      expect(response.status).toBe(404);
    });
  });

  it('DELETE /postulaciones/:id elimina la postulación', async () => {
    const response = await request(app)
      .delete(`/postulaciones/${applicationId}`)
      .set('Cookie', postulante.cookie);

    expect(response.status).toBe(204);

    const deletedApplication = await prisma.postulacion.findUnique({
      where: {
        id: applicationId,
      },
    });

    expect(deletedApplication).toBeNull();

    applicationId = 0;
  });

  it('DELETE /postulaciones/:id devuelve 404 si no existe', async () => {
    const response = await request(app)
      .delete('/postulaciones/999999')
      .set('Cookie', admin.cookie);

    expect(response.status).toBe(404);
  });
});
