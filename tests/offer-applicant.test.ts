import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import app from '../src/app';
import { prisma } from '../src/config/prisma';
import {
  createAdmin,
  createApplicant,
  createMember,
  deleteUsers,
} from './session';

// Qué ofertas ve un postulante en la bolsa de trabajo: solo las abiertas.
describe('Ofertas vistas por un postulante', () => {
  let admin: Awaited<ReturnType<typeof createAdmin>>;
  let socio: Awaited<ReturnType<typeof createMember>>;
  let postulante: Awaited<ReturnType<typeof createApplicant>>;

  let activeOfferId: number;
  let closedOfferId: number;

  function createOffer(estado: 'ACTIVA' | 'CERRADA') {
    return prisma.oferta.create({
      data: {
        socioId: socio.socioId,
        creadaPor: socio.userId,
        titulo: `Oferta ${estado} de prueba`,
        descripcion: 'Oferta creada por los tests de postulante',
        estado,
      },
    });
  }

  beforeAll(async () => {
    admin = await createAdmin();
    socio = await createMember();
    postulante = await createApplicant({ withCv: false });

    activeOfferId = (await createOffer('ACTIVA')).id;
    closedOfferId = (await createOffer('CERRADA')).id;
  });

  afterAll(async () => {
    // deleteUsers borra también las ofertas del socio de prueba.
    await deleteUsers([admin.userId, socio.userId, postulante.userId]);
    await prisma.$disconnect();
  });

  async function listedIds(cookie: string[]) {
    const response = await request(app).get('/ofertas').set('Cookie', cookie);

    expect(response.status).toBe(200);

    return (response.body as { id: number }[]).map((offer) => offer.id);
  }

  it('GET /ofertas le muestra al postulante solo las ofertas activas', async () => {
    const response = await request(app)
      .get('/ofertas')
      .set('Cookie', postulante.cookie);

    expect(response.status).toBe(200);

    const ids = (response.body as { id: number }[]).map((offer) => offer.id);

    expect(ids).toContain(activeOfferId);
    expect(ids).not.toContain(closedOfferId);

    for (const offer of response.body as { estado: string }[]) {
      expect(offer.estado).toBe('ACTIVA');
    }
  });

  it('GET /ofertas le sigue mostrando todas al administrador', async () => {
    const ids = await listedIds(admin.cookie);

    expect(ids).toContain(activeOfferId);
    expect(ids).toContain(closedOfferId);
  });

  it('GET /ofertas/:id muestra una oferta activa al postulante', async () => {
    const response = await request(app)
      .get(`/ofertas/${activeOfferId}`)
      .set('Cookie', postulante.cookie);

    expect(response.status).toBe(200);
    expect(response.body.id).toBe(activeOfferId);
  });

  it('GET /ofertas/:id responde 404 al postulante si la oferta está cerrada', async () => {
    const response = await request(app)
      .get(`/ofertas/${closedOfferId}`)
      .set('Cookie', postulante.cookie);

    expect(response.status).toBe(404);
    expect(response.body.message).toBe('Oferta no encontrada');
  });

  it('GET /ofertas/:id muestra la oferta cerrada al administrador', async () => {
    const response = await request(app)
      .get(`/ofertas/${closedOfferId}`)
      .set('Cookie', admin.cookie);

    expect(response.status).toBe(200);
  });

  it('una oferta vencida deja de aparecer para el postulante', async () => {
    const expired = await prisma.oferta.create({
      data: {
        socioId: socio.socioId,
        creadaPor: socio.userId,
        titulo: 'Oferta vencida de prueba',
        descripcion: 'Su fecha de cierre ya pasó',
        fechaCierre: new Date(Date.now() - 24 * 60 * 60 * 1000),
      },
    });

    const ids = await listedIds(postulante.cookie);

    expect(ids).not.toContain(expired.id);
  });
});
