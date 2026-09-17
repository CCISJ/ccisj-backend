import request from 'supertest';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import app from '../src/app';
import { prisma } from '../src/config/prisma';
import {
  createAdmin,
  createApplicant,
  createCategory,
  createMember,
  deleteUsers,
} from './session';

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

    // Ni quién la creó: si la publicó la administración no se tiene que notar.
    expect(response.body).not.toHaveProperty('creador');
    expect(response.body).not.toHaveProperty('creadaPor');
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
      'La cantidad de vacantes debe estar entre 1 y 999',
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

      const stored = await prisma.oferta.findUnique({
        where: { id: response.body.id },
      });

      expect(stored!.creadaPor).toBe(socio.userId);
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

      const stored = await prisma.oferta.findUnique({
        where: { id: response.body.id },
      });

      expect(stored!.creadaPor).toBe(admin.userId);

      // Para un postulante se ve igual que una publicada por la empresa.
      const [listed] = (
        await request(app).get('/ofertas').set('Cookie', postulante.cookie)
      ).body.filter((offer: { id: number }) => offer.id === response.body.id);

      expect(listed).not.toHaveProperty('creador');
      expect(listed).not.toHaveProperty('creadaPor');
    });

    it('no se publica ni se reabre una oferta de un socio dado de baja', async () => {
      const baja = await createMember();

      try {
        const offer = await prisma.oferta.create({
          data: {
            socioId: baja.socioId,
            creadaPor: admin.userId,
            titulo: 'Oferta de empresa dada de baja',
            descripcion: 'Oferta de prueba',
            estado: 'CERRADA',
          },
        });

        await prisma.usuario.update({
          where: { id: baja.userId },
          data: { activo: false },
        });

        const create = await request(app)
          .post('/ofertas')
          .set('Cookie', admin.cookie)
          .send({ ...baseOffer(), socioId: baja.socioId });

        expect(create.status).toBe(400);
        expect(create.body.message).toBe(
          'El socio está dado de baja: no puede publicar ofertas',
        );

        const reopen = await request(app)
          .patch(`/ofertas/${offer.id}`)
          .set('Cookie', admin.cookie)
          .send({ estado: 'ACTIVA' });

        expect(reopen.status).toBe(400);
        expect(reopen.body.message).toBe(
          'El socio está dado de baja: no se puede reabrir la oferta',
        );

        // Editar otros datos o dejarla cerrada sí se puede.
        const edit = await request(app)
          .patch(`/ofertas/${offer.id}`)
          .set('Cookie', admin.cookie)
          .send({ titulo: 'Oferta corregida', estado: 'CERRADA' });

        expect(edit.status).toBe(200);
      } finally {
        await deleteUsers([baja.userId]);
      }
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

  describe('mis ofertas del socio', () => {
    it('GET /ofertas/mias devuelve solo las ofertas de su empresa, con el conteo de postulaciones', async () => {
      const own = await request(app)
        .post('/ofertas')
        .set('Cookie', socio.cookie)
        .send(baseOffer());

      const response = await request(app)
        .get('/ofertas/mias')
        .set('Cookie', socio.cookie);

      expect(response.status).toBe(200);
      expect(response.body.length).toBeGreaterThan(0);

      for (const offer of response.body) {
        expect(offer.socioId).toBe(socio.socioId);
      }

      const found = response.body.find(
        (offer: { id: number }) => offer.id === own.body.id,
      );

      expect(found._count.postulaciones).toBe(0);
      expect(found.categorias).toHaveLength(2);
    });

    it('GET /ofertas/mias es solo para socios', async () => {
      const asApplicant = await request(app)
        .get('/ofertas/mias')
        .set('Cookie', postulante.cookie);

      const asAdmin = await request(app)
        .get('/ofertas/mias')
        .set('Cookie', admin.cookie);

      expect(asApplicant.status).toBe(403);
      expect(asAdmin.status).toBe(403);
    });

    it('GET /ofertas/mias/:id devuelve 404 para una oferta de otra empresa', async () => {
      const foreign = await request(app)
        .post('/ofertas')
        .set('Cookie', otherSocio.cookie)
        .send(baseOffer());

      const response = await request(app)
        .get(`/ofertas/mias/${foreign.body.id}`)
        .set('Cookie', socio.cookie);

      expect(response.status).toBe(404);
    });

    it('GET /ofertas no expone cuántas postulaciones tiene cada oferta', async () => {
      const response = await request(app)
        .get('/ofertas')
        .set('Cookie', postulante.cookie);

      for (const offer of response.body) {
        expect(offer).not.toHaveProperty('_count');
      }
    });
  });

  describe('validaciones', () => {
    // Días en hora de Uruguay (UTC-3), como los manda el formulario.
    const uruguayDay = (offsetDays: number) =>
      new Date(Date.now() - 3 * 60 * 60 * 1000 + offsetDays * 86_400_000)
        .toISOString()
        .slice(0, 10);

    const publish = (body: object) =>
      request(app)
        .post('/ofertas')
        .set('Cookie', socio.cookie)
        .send({ ...baseOffer(), ...body });

    it('rechaza un título demasiado largo', async () => {
      const response = await publish({ titulo: 'a'.repeat(151) });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe(
        'El título no puede superar los 150 caracteres',
      );
    });

    it('rechaza un título vacío', async () => {
      const response = await publish({ titulo: '   ' });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('El título es obligatorio');
    });

    it('rechaza una modalidad fuera de la lista', async () => {
      const response = await publish({ modalidad: 'A distancia' });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('La modalidad no es válida');
    });

    it('rechaza una cantidad de vacantes que no entra en la base', async () => {
      const response = await publish({ cantidadVacantes: 3_000_000_000 });

      expect(response.status).toBe(400);
    });

    it('rechaza una fecha de cierre pasada', async () => {
      const response = await publish({ fechaCierre: uruguayDay(-1) });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe(
        'La fecha de cierre no puede ser anterior a hoy',
      );
    });

    it('rechaza fechas inexistentes o con otro formato', async () => {
      for (const fechaCierre of [
        '2099-02-30',
        '2099-13-01',
        '2099-12-31T10:00:00Z',
        '31/12/2099',
      ]) {
        const response = await publish({ fechaCierre });

        expect(response.status).toBe(400);
        expect(response.body.message).toBe('La fecha de cierre no es válida');
      }
    });

    it('acepta cerrar hoy y guarda el final de ese día en hora de Uruguay', async () => {
      const today = uruguayDay(0);
      const response = await publish({ fechaCierre: today });

      expect(response.status).toBe(201);
      expect(response.body.estado).toBe('ACTIVA');
      expect(response.body.fechaCierre).toBe(
        new Date(`${today}T23:59:59.999-03:00`).toISOString(),
      );
    });

    it('publica activa aunque el body pida otro estado, y la ubicación vacía queda null', async () => {
      const response = await publish({ estado: 'CERRADA', ubicacion: '  ' });

      expect(response.status).toBe(201);
      expect(response.body.estado).toBe('ACTIVA');
      expect(response.body.ubicacion).toBeNull();
    });

    it('no deja elegir una categoría desactivada, pero la oferta que ya la tenía la conserva', async () => {
      const inactive = await createCategory();

      try {
        const offer = await publish({
          categoriaIds: [categoryId, inactive.id],
        });

        expect(offer.status).toBe(201);

        await prisma.categoria.update({
          where: { id: inactive.id },
          data: { activa: false },
        });

        const rejected = await publish({ categoriaIds: [inactive.id] });

        expect(rejected.status).toBe(400);
        expect(rejected.body.message).toBe(
          `La categoría ${inactive.nombre} ya no está disponible`,
        );

        const kept = await request(app)
          .patch(`/ofertas/${offer.body.id}`)
          .set('Cookie', socio.cookie)
          .send({ categoriaIds: [inactive.id] });

        expect(kept.status).toBe(200);
        expect(kept.body.categorias).toHaveLength(1);
      } finally {
        await prisma.categoria.delete({ where: { id: inactive.id } });
      }
    });

    it('rechaza un body que no es un objeto', async () => {
      const response = await request(app)
        .post('/ofertas')
        .set('Cookie', socio.cookie)
        .send([baseOffer()]);

      expect(response.status).toBe(400);
    });
  });

  describe('cierre por fecha', () => {
    let expiredId: number;

    // Simula una oferta cuya fecha de cierre ya pasó (la API no deja cargarla).
    const expireOffer = (id: number) =>
      prisma.oferta.update({
        where: { id },
        data: { fechaCierre: new Date(Date.now() - 60_000) },
      });

    beforeAll(async () => {
      const response = await request(app)
        .post('/ofertas')
        .set('Cookie', socio.cookie)
        .send(baseOffer());

      expiredId = response.body.id;

      await expireOffer(expiredId);
    });

    // No se verifica que siga ACTIVA en la base: los tests de otros módulos
    // corren en paralelo y cualquier lectura de ofertas la cierra.
    it('no acepta postulaciones con la fecha de cierre vencida', async () => {
      const response = await request(app)
        .post('/postulaciones')
        .set('Cookie', postulante.cookie)
        .send({ ofertaId: expiredId });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('La oferta no está activa');
    });

    it('se muestra cerrada al consultarla', async () => {
      const response = await request(app)
        .get(`/ofertas/${expiredId}`)
        .set('Cookie', postulante.cookie);

      expect(response.status).toBe(200);
      expect(response.body.estado).toBe('CERRADA');
    });

    it('no se reabre sin mover la fecha de cierre', async () => {
      const response = await request(app)
        .patch(`/ofertas/${expiredId}`)
        .set('Cookie', socio.cookie)
        .send({ estado: 'ACTIVA' });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe(
        'Para reabrir la oferta, elegí una fecha de cierre a partir de hoy o quitala',
      );
    });

    it('se reabre con una fecha nueva o sin fecha', async () => {
      const withDate = await request(app)
        .patch(`/ofertas/${expiredId}`)
        .set('Cookie', socio.cookie)
        .send({ estado: 'ACTIVA', fechaCierre: '2099-12-31' });

      expect(withDate.status).toBe(200);
      expect(withDate.body.estado).toBe('ACTIVA');

      await request(app)
        .patch(`/ofertas/${expiredId}`)
        .set('Cookie', socio.cookie)
        .send({ estado: 'CERRADA' });

      await expireOffer(expiredId);

      const withoutDate = await request(app)
        .patch(`/ofertas/${expiredId}`)
        .set('Cookie', socio.cookie)
        .send({ estado: 'ACTIVA', fechaCierre: null });

      expect(withoutDate.status).toBe(200);
      expect(withoutDate.body.estado).toBe('ACTIVA');
      expect(withoutDate.body.fechaCierre).toBeNull();
    });
  });

  describe('borrado con postulaciones', () => {
    it('no borra una oferta que ya recibió postulaciones, pero se puede cerrar', async () => {
      const offer = await request(app)
        .post('/ofertas')
        .set('Cookie', socio.cookie)
        .send(baseOffer());

      const application = await request(app)
        .post('/postulaciones')
        .set('Cookie', postulante.cookie)
        .send({ ofertaId: offer.body.id });

      expect(application.status).toBe(201);

      const remove = await request(app)
        .delete(`/ofertas/${offer.body.id}`)
        .set('Cookie', socio.cookie);

      expect(remove.status).toBe(409);
      expect(remove.body.message).toBe(
        'No se puede eliminar una oferta que ya recibió postulaciones. Podés cerrarla.',
      );

      const storedApplication = await prisma.postulacion.findUnique({
        where: { id: application.body.id },
      });

      expect(storedApplication).not.toBeNull();

      const mine = await request(app)
        .get(`/ofertas/mias/${offer.body.id}`)
        .set('Cookie', socio.cookie);

      expect(mine.body._count.postulaciones).toBe(1);

      const close = await request(app)
        .patch(`/ofertas/${offer.body.id}`)
        .set('Cookie', socio.cookie)
        .send({ estado: 'CERRADA' });

      expect(close.status).toBe(200);
      expect(close.body.estado).toBe('CERRADA');
    });
  });
});
