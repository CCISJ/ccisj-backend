import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import app from '../src/app';
import { prisma } from '../src/config/prisma';
import {
  createAdmin,
  createMember,
  deleteUsers,
  sessionCookie,
} from './session';

// La bolsa de trabajo pública: el cliente definió que cualquiera ve las
// ofertas sin tener cuenta, y que solo los registrados se postulan. Estos
// tests entran sin cookie, como un visitante cualquiera.
describe('Ofertas sin sesión (bolsa de trabajo pública)', () => {
  let admin: Awaited<ReturnType<typeof createAdmin>>;
  let socio: Awaited<ReturnType<typeof createMember>>;

  let activeOfferId: number;
  let closedOfferId: number;

  function createOffer(estado: 'ACTIVA' | 'CERRADA') {
    return prisma.oferta.create({
      data: {
        socioId: socio.socioId,
        creadaPor: socio.userId,
        titulo: `Oferta ${estado} publica de prueba`,
        descripcion: 'Oferta creada por los tests de la bolsa publica',
        estado,
      },
    });
  }

  beforeAll(async () => {
    admin = await createAdmin();
    socio = await createMember();

    activeOfferId = (await createOffer('ACTIVA')).id;
    closedOfferId = (await createOffer('CERRADA')).id;
  });

  afterAll(async () => {
    // deleteUsers borra también las ofertas del socio de prueba.
    await deleteUsers([admin.userId, socio.userId]);
    await prisma.$disconnect();
  });

  it('GET /ofertas contesta sin cookie y muestra solo las activas', async () => {
    const response = await request(app).get('/ofertas');

    expect(response.status).toBe(200);

    const ids = (response.body as { id: number }[]).map((offer) => offer.id);

    expect(ids).toContain(activeOfferId);
    expect(ids).not.toContain(closedOfferId);

    for (const offer of response.body as { estado: string }[]) {
      expect(offer.estado).toBe('ACTIVA');
    }
  });

  it('GET /ofertas/:id muestra una oferta activa sin cookie', async () => {
    const response = await request(app).get(`/ofertas/${activeOfferId}`);

    expect(response.status).toBe(200);
    expect(response.body.id).toBe(activeOfferId);
  });

  it('GET /ofertas/:id responde 404 sin cookie si la oferta está cerrada', async () => {
    const response = await request(app).get(`/ofertas/${closedOfferId}`);

    expect(response.status).toBe(404);
    expect(response.body.message).toBe('Oferta no encontrada');
  });

  // Lo público es la oferta y el nombre de la empresa, no su legajo: sin esto,
  // abrir la bolsa de trabajo filtraría RUT y BPS de los socios a cualquiera.
  it('no expone datos internos de la empresa ni quién publicó', async () => {
    const response = await request(app).get(`/ofertas/${activeOfferId}`);

    expect(response.status).toBe(200);

    expect(response.body.creadaPor).toBeUndefined();

    expect(Object.keys(response.body.socio).sort()).toEqual([
      'ciudad',
      'giroComercial',
      'id',
      'razonSocial',
    ]);
  });

  // Un visitante con una cookie que ya no sirve tiene que ver la bolsa igual,
  // no un 401: lo único que quiere es mirar las ofertas.
  it('una cookie inválida se trata como visitante anónimo', async () => {
    const response = await request(app)
      .get('/ofertas')
      .set('Cookie', sessionCookie(2147483000, 'POSTULANTE'));

    expect(response.status).toBe(200);

    const ids = (response.body as { id: number }[]).map((offer) => offer.id);

    expect(ids).toContain(activeOfferId);
    expect(ids).not.toContain(closedOfferId);
  });

  it('con sesión de socio sigue mostrando también las cerradas', async () => {
    const response = await request(app)
      .get('/ofertas')
      .set('Cookie', socio.cookie);

    expect(response.status).toBe(200);

    const ids = (response.body as { id: number }[]).map((offer) => offer.id);

    expect(ids).toContain(activeOfferId);
    expect(ids).toContain(closedOfferId);
  });

  // Público es solo leer. Todo lo que escribe, y lo que es de un socio, sigue
  // pidiendo sesión.
  it('POST /ofertas sigue necesitando sesión', async () => {
    const response = await request(app).post('/ofertas').send({
      titulo: 'Oferta sin sesion',
      descripcion: 'No deberia crearse',
      cantidadVacantes: 1,
    });

    expect(response.status).toBe(401);
  });

  it('PATCH y DELETE de una oferta siguen necesitando sesión', async () => {
    const patch = await request(app)
      .patch(`/ofertas/${activeOfferId}`)
      .send({ titulo: 'Cambiado sin sesion' });

    expect(patch.status).toBe(401);

    const remove = await request(app).delete(`/ofertas/${activeOfferId}`);

    expect(remove.status).toBe(401);

    const offer = await prisma.oferta.findUnique({
      where: { id: activeOfferId },
    });

    expect(offer?.titulo).toBe('Oferta ACTIVA publica de prueba');
  });

  it('GET /ofertas/mias sigue necesitando sesión', async () => {
    const response = await request(app).get('/ofertas/mias');

    expect(response.status).toBe(401);
  });

  it('el resto de la API sigue cerrada sin sesión', async () => {
    for (const path of [
      '/socios',
      '/postulantes',
      '/usuarios',
      '/cuotas/resumen',
    ]) {
      const response = await request(app).get(path);

      expect(response.status, `${path} debería pedir sesión`).toBe(401);
    }
  });
});
