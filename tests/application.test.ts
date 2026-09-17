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
      });

    expect(response.status).toBe(200);

    expect(response.body.estado).toBe('EN_REVISION');
    expect(response.body.observaciones).toBe('Postulación de prueba');
  });

  it('PATCH /postulaciones/:id: el admin puede cambiar las observaciones', async () => {
    const response = await request(app)
      .patch(`/postulaciones/${applicationId}`)
      .set('Cookie', admin.cookie)
      .send({
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

  it('POST /postulaciones con doble envío simultáneo crea una sola y no da error interno', async () => {
    const offer = await prisma.oferta.create({
      data: {
        socioId: socio.socioId,
        creadaPor: socio.userId,
        titulo: 'Oferta para doble envío',
        descripcion: 'Oferta de prueba',
      },
    });

    const responses = await Promise.all(
      [1, 2, 3].map(() =>
        request(app)
          .post('/postulaciones')
          .set('Cookie', otherPostulante.cookie)
          .send({ ofertaId: offer.id }),
      ),
    );

    const statuses = responses.map((r) => r.status).sort();

    expect(statuses.filter((s) => s === 201)).toHaveLength(1);
    expect(statuses.every((s) => s === 201 || s === 400)).toBe(true);

    for (const response of responses.filter((r) => r.status === 400)) {
      expect(response.body.message).toBe(
        'El postulante ya se postuló a esta oferta',
      );
    }

    expect(
      await prisma.postulacion.count({ where: { ofertaId: offer.id } }),
    ).toBe(1);
  });

  it('POST /postulaciones limita el largo del mensaje', async () => {
    const response = await request(app)
      .post('/postulaciones')
      .set('Cookie', otherPostulante.cookie)
      .send({ ofertaId: offerId, observaciones: 'x'.repeat(2001) });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe(
      'El mensaje no puede superar los 2000 caracteres',
    );
  });

  it('un ID que no es entero responde 400 sin llegar a la base', async () => {
    const response = await request(app)
      .get('/postulaciones/1.5')
      .set('Cookie', admin.cookie);

    expect(response.status).toBe(400);
    expect(response.body.message).toBe('ID inválido');
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

  describe('postulaciones recibidas por la empresa', () => {
    let receivedOfferId: number;
    let receivedId: number;
    let otherReceivedId: number;

    const countNotifications = (usuarioId: number) =>
      prisma.notificacionUsuario.count({ where: { usuarioId } });

    beforeAll(async () => {
      const offer = await request(app)
        .post('/ofertas')
        .set('Cookie', socio.cookie)
        .send({
          titulo: 'Oferta con postulaciones recibidas',
          descripcion: 'Oferta de prueba',
          modalidad: 'REMOTO',
          categoriaIds: [categoryId],
        });

      expect(offer.status).toBe(201);

      receivedOfferId = offer.body.id;

      const first = await request(app)
        .post('/postulaciones')
        .set('Cookie', postulante.cookie)
        .send({ ofertaId: receivedOfferId, observaciones: 'Me interesa' });

      const second = await request(app)
        .post('/postulaciones')
        .set('Cookie', otherPostulante.cookie)
        .send({ ofertaId: receivedOfferId });

      expect(first.status).toBe(201);
      expect(second.status).toBe(201);

      receivedId = first.body.id;
      otherReceivedId = second.body.id;
    });

    it('la empresa ve las postulaciones a sus ofertas con contacto y CV', async () => {
      const response = await request(app)
        .get('/postulaciones/recibidas')
        .set('Cookie', socio.cookie);

      expect(response.status).toBe(200);

      const received = response.body.find(
        (item: { id: number }) => item.id === receivedId,
      );

      expect(received).toMatchObject({
        estado: 'ENVIADA',
        observaciones: 'Me interesa',
        oferta: {
          id: receivedOfferId,
          titulo: 'Oferta con postulaciones recibidas',
          estado: 'ACTIVA',
        },
        postulante: {
          id: postulante.postulanteId,
          nombre: 'Postulante',
          usuario: { email: postulante.email },
        },
      });

      expect(received.postulante.cvs).toHaveLength(1);
      expect(received.postulante.cvs[0]).toMatchObject({
        archivoUrl: '/uploads/cv/test.pdf',
        descripcion: 'CV de prueba',
      });

      // De la cuenta del postulante solo viaja el email.
      expect(received.postulante).not.toHaveProperty('usuarioId');
      expect(received.postulante.usuario).toEqual({ email: postulante.email });
    });

    it('otra empresa no ve esas postulaciones', async () => {
      const list = await request(app)
        .get('/postulaciones/recibidas')
        .set('Cookie', otherSocio.cookie);

      expect(list.status).toBe(200);
      expect(
        list.body.some((item: { id: number }) =>
          [receivedId, otherReceivedId, applicationId].includes(item.id),
        ),
      ).toBe(false);

      const detail = await request(app)
        .get(`/postulaciones/recibidas/${receivedId}`)
        .set('Cookie', otherSocio.cookie);

      expect(detail.status).toBe(404);
    });

    it('el listado de recibidas es solo para socios', async () => {
      const asApplicant = await request(app)
        .get('/postulaciones/recibidas')
        .set('Cookie', postulante.cookie);

      const asAdmin = await request(app)
        .get('/postulaciones/recibidas')
        .set('Cookie', admin.cookie);

      expect(asApplicant.status).toBe(403);
      expect(asAdmin.status).toBe(403);
    });

    it('GET /postulaciones/recibidas/:id valida el ID', async () => {
      const response = await request(app)
        .get('/postulaciones/recibidas/abc')
        .set('Cookie', socio.cookie);

      expect(response.status).toBe(400);
    });

    it('cambiar el estado le avisa al postulante', async () => {
      const before = await countNotifications(postulante.userId);

      const response = await request(app)
        .patch(`/postulaciones/${receivedId}`)
        .set('Cookie', socio.cookie)
        .send({ estado: 'SELECCIONADO' });

      expect(response.status).toBe(200);
      expect(response.body.estado).toBe('SELECCIONADO');
      expect(response.body.observaciones).toBe('Me interesa');

      expect(await countNotifications(postulante.userId)).toBe(before + 1);

      const inbox = await request(app)
        .get('/notificaciones/recibidas')
        .set('Cookie', postulante.cookie);

      expect(inbox.status).toBe(200);
      expect(inbox.body[0].notificacion).toMatchObject({
        titulo: 'Tu postulación: Seleccionado',
        tipo: 'NORMAL',
      });
      expect(inbox.body[0].notificacion.mensaje).toContain(
        '«Oferta con postulaciones recibidas»',
      );

      // El aviso automático no aparece entre las enviadas por el admin.
      const sent = await request(app)
        .get('/notificaciones')
        .set('Cookie', admin.cookie);

      expect(sent.status).toBe(200);
      expect(
        sent.body.some(
          (item: { id: number }) => item.id === inbox.body[0].notificacion.id,
        ),
      ).toBe(false);
    });

    it('repetir el mismo estado no genera otro aviso', async () => {
      const before = await countNotifications(postulante.userId);

      const response = await request(app)
        .patch(`/postulaciones/${receivedId}`)
        .set('Cookie', socio.cookie)
        .send({ estado: 'SELECCIONADO' });

      expect(response.status).toBe(200);
      expect(await countNotifications(postulante.userId)).toBe(before);
    });

    it('la empresa puede volver atrás entre sus estados', async () => {
      const response = await request(app)
        .patch(`/postulaciones/${receivedId}`)
        .set('Cookie', socio.cookie)
        .send({ estado: 'EN_REVISION' });

      expect(response.status).toBe(200);
      expect(response.body.estado).toBe('EN_REVISION');
    });

    it('la empresa no pisa las observaciones del postulante', async () => {
      const response = await request(app)
        .patch(`/postulaciones/${receivedId}`)
        .set('Cookie', socio.cookie)
        .send({ estado: 'NO_SELECCIONADO', observaciones: 'Nota interna' });

      expect(response.status).toBe(400);

      const stored = await prisma.postulacion.findUnique({
        where: { id: receivedId },
      });

      expect(stored).toMatchObject({
        estado: 'EN_REVISION',
        observaciones: 'Me interesa',
      });
    });

    it.each([
      ['ENVIADA', { estado: 'ENVIADA' }],
      ['FINALIZADA', { estado: 'FINALIZADA' }],
      ['un estado inexistente', { estado: 'CONTRATADO' }],
      ['sin estado', {}],
    ])('la empresa no puede pasar a %s', async (_label, body) => {
      const response = await request(app)
        .patch(`/postulaciones/${receivedId}`)
        .set('Cookie', socio.cookie)
        .send(body);

      expect(response.status).toBe(400);
    });

    it('rechaza un body que no es un objeto', async () => {
      const response = await request(app)
        .patch(`/postulaciones/${receivedId}`)
        .set('Cookie', socio.cookie)
        .send([{ estado: 'SELECCIONADO' }]);

      expect(response.status).toBe(400);
    });

    it('una postulación finalizada ya no la cambia la empresa', async () => {
      await prisma.postulacion.update({
        where: { id: otherReceivedId },
        data: { estado: 'FINALIZADA' },
      });

      const response = await request(app)
        .patch(`/postulaciones/${otherReceivedId}`)
        .set('Cookie', socio.cookie)
        .send({ estado: 'SELECCIONADO' });

      expect(response.status).toBe(409);

      const stored = await prisma.postulacion.findUnique({
        where: { id: otherReceivedId },
      });

      expect(stored!.estado).toBe('FINALIZADA');
    });

    it('a un postulante desactivado no se le crea el aviso', async () => {
      await prisma.postulacion.update({
        where: { id: otherReceivedId },
        data: { estado: 'ENVIADA' },
      });

      await prisma.usuario.update({
        where: { id: otherPostulante.userId },
        data: { activo: false },
      });

      try {
        const before = await countNotifications(otherPostulante.userId);

        const response = await request(app)
          .patch(`/postulaciones/${otherReceivedId}`)
          .set('Cookie', socio.cookie)
          .send({ estado: 'NO_SELECCIONADO' });

        expect(response.status).toBe(200);
        expect(response.body.estado).toBe('NO_SELECCIONADO');
        expect(await countNotifications(otherPostulante.userId)).toBe(before);
      } finally {
        await prisma.usuario.update({
          where: { id: otherPostulante.userId },
          data: { activo: true },
        });
      }
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
