import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import app from '../src/app';
import { prisma } from '../src/config/prisma';
import {
  createAdmin,
  createApplicant,
  createMember,
  deleteNotificationsCreatedBy,
  deleteUsers,
} from './session';

describe('Notificaciones', () => {
  let admin: Awaited<ReturnType<typeof createAdmin>>;
  let socio: Awaited<ReturnType<typeof createMember>>;
  let postulante: Awaited<ReturnType<typeof createApplicant>>;

  beforeAll(async () => {
    admin = await createAdmin();
    socio = await createMember();
    postulante = await createApplicant();
  });

  beforeEach(async () => {
    await deleteNotificationsCreatedBy([admin.userId]);
  });

  afterAll(async () => {
    await deleteUsers([admin.userId, socio.userId, postulante.userId]);
  });

  it('debería crear una notificación para todos los usuarios', async () => {
    const response = await request(app)
      .post('/notificaciones')
      .set('Cookie', admin.cookie)
      .send({
        titulo: 'Comunicado general',
        mensaje: 'Mensaje para todos los usuarios',
        tipo: 'NORMAL',
        destinatarioTipo: 'TODOS',
      });

    expect(response.status).toBe(201);

    expect(response.body).toMatchObject({
      titulo: 'Comunicado general',
      mensaje: 'Mensaje para todos los usuarios',
      tipo: 'NORMAL',
    });

    expect(response.body.destinatarios.length).toBeGreaterThan(0);
  });

  it('debería crear una notificación solamente para socios', async () => {
    const response = await request(app)
      .post('/notificaciones')
      .set('Cookie', admin.cookie)
      .send({
        titulo: 'Aviso para socios',
        mensaje: 'Este mensaje es solamente para socios',
        tipo: 'NORMAL',
        destinatarioTipo: 'SOCIOS',
      });

    expect(response.status).toBe(201);
    expect(response.body.destinatarios.length).toBeGreaterThan(0);

    for (const destinatario of response.body.destinatarios) {
      expect(destinatario.usuario.tipo).toBe('SOCIO');
    }
  });

  it('debería crear una notificación solamente para postulantes', async () => {
    const response = await request(app)
      .post('/notificaciones')
      .set('Cookie', admin.cookie)
      .send({
        titulo: 'Aviso para postulantes',
        mensaje: 'Este mensaje es solamente para postulantes',
        tipo: 'NORMAL',
        destinatarioTipo: 'POSTULANTES',
      });

    expect(response.status).toBe(201);
    expect(response.body.destinatarios.length).toBeGreaterThan(0);

    for (const destinatario of response.body.destinatarios) {
      expect(destinatario.usuario.tipo).toBe('POSTULANTE');
    }
  });

  it('debería crear una notificación para usuarios específicos', async () => {
    const response = await request(app)
      .post('/notificaciones')
      .set('Cookie', admin.cookie)
      .send({
        titulo: 'Mensaje individual',
        mensaje: 'Mensaje para un usuario específico',
        tipo: 'NORMAL',
        destinatarioTipo: 'USUARIOS',
        usuarioIds: [postulante.userId],
      });

    expect(response.status).toBe(201);

    expect(response.body.destinatarios).toHaveLength(1);

    expect(response.body.destinatarios[0].usuario.id).toBe(postulante.userId);
  });

  it('debería devolver las notificaciones recibidas por el usuario', async () => {
    await request(app)
      .post('/notificaciones')
      .set('Cookie', admin.cookie)
      .send({
        titulo: 'Notificación recibida',
        mensaje: 'Mensaje de prueba',
        tipo: 'NORMAL',
        destinatarioTipo: 'USUARIOS',
        usuarioIds: [postulante.userId],
      });

    const response = await request(app)
      .get('/notificaciones/recibidas')
      .set('Cookie', postulante.cookie);

    expect(response.status).toBe(200);
    expect(response.body.length).toBeGreaterThan(0);

    expect(response.body[0].notificacion).toMatchObject({
      titulo: 'Notificación recibida',
      mensaje: 'Mensaje de prueba',
    });
  });

  it('debería devolver las notificaciones emergentes pendientes', async () => {
    await request(app)
      .post('/notificaciones')
      .set('Cookie', admin.cookie)
      .send({
        titulo: 'Aviso importante',
        mensaje: 'Esta es una notificación emergente',
        tipo: 'EMERGENTE',
        destinatarioTipo: 'USUARIOS',
        usuarioIds: [postulante.userId],
      });

    const response = await request(app)
      .get('/notificaciones/emergentes')
      .set('Cookie', postulante.cookie);

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(1);

    expect(response.body[0].emergenteVista).toBe(false);
    expect(response.body[0].notificacion.tipo).toBe('EMERGENTE');
  });

  it('debería marcar una notificación como leída', async () => {
    await request(app)
      .post('/notificaciones')
      .set('Cookie', admin.cookie)
      .send({
        titulo: 'Notificación para leer',
        mensaje: 'Mensaje de prueba',
        tipo: 'NORMAL',
        destinatarioTipo: 'USUARIOS',
        usuarioIds: [postulante.userId],
      });

    const notificationUser = await prisma.notificacionUsuario.findFirst({
      where: {
        usuarioId: postulante.userId,
      },
    });

    expect(notificationUser).not.toBeNull();

    const response = await request(app)
      .patch(`/notificaciones/${notificationUser!.notificacionId}/leida`)
      .set('Cookie', postulante.cookie);

    expect(response.status).toBe(200);
    expect(response.body.leida).toBe(true);
    expect(response.body.fechaLectura).not.toBeNull();
  });

  it('debería marcar una notificación emergente como vista', async () => {
    await request(app)
      .post('/notificaciones')
      .set('Cookie', admin.cookie)
      .send({
        titulo: 'Emergente',
        mensaje: 'Mensaje emergente',
        tipo: 'EMERGENTE',
        destinatarioTipo: 'USUARIOS',
        usuarioIds: [postulante.userId],
      });

    const notificationUser = await prisma.notificacionUsuario.findFirst({
      where: {
        usuarioId: postulante.userId,
      },
    });

    expect(notificationUser).not.toBeNull();

    const response = await request(app)
      .patch(
        `/notificaciones/${notificationUser!.notificacionId}/emergente-vista`,
      )
      .set('Cookie', postulante.cookie);

    expect(response.status).toBe(200);
    expect(response.body.emergenteVista).toBe(true);
    expect(response.body.fechaEmergenteVista).not.toBeNull();
  });

  it('una emergente vista no debería volver a aparecer como pendiente', async () => {
    await request(app)
      .post('/notificaciones')
      .set('Cookie', admin.cookie)
      .send({
        titulo: 'Emergente única',
        mensaje: 'Debe mostrarse una sola vez',
        tipo: 'EMERGENTE',
        destinatarioTipo: 'USUARIOS',
        usuarioIds: [postulante.userId],
      });

    const pendingResponse = await request(app)
      .get('/notificaciones/emergentes')
      .set('Cookie', postulante.cookie);

    expect(pendingResponse.status).toBe(200);
    expect(pendingResponse.body).toHaveLength(1);

    const notificationId = pendingResponse.body[0].notificacion.id;

    const markResponse = await request(app)
      .patch(`/notificaciones/${notificationId}/emergente-vista`)
      .set('Cookie', postulante.cookie);

    expect(markResponse.status).toBe(200);

    const secondResponse = await request(app)
      .get('/notificaciones/emergentes')
      .set('Cookie', postulante.cookie);

    expect(secondResponse.status).toBe(200);
    expect(secondResponse.body).toHaveLength(0);
  });

  it('no debería permitir acceder sin autenticación', async () => {
    const response = await request(app).get('/notificaciones/recibidas');

    expect(response.status).toBe(401);
  });

  it('solo el administrador puede crear notificaciones', async () => {
    const payload = {
      titulo: 'Intento no autorizado',
      mensaje: 'No debería enviarse',
      tipo: 'EMERGENTE',
      destinatarioTipo: 'TODOS',
    };

    const asSocio = await request(app)
      .post('/notificaciones')
      .set('Cookie', socio.cookie)
      .send(payload);
    const asPostulante = await request(app)
      .post('/notificaciones')
      .set('Cookie', postulante.cookie)
      .send(payload);

    expect(asSocio.status).toBe(403);
    expect(asPostulante.status).toBe(403);

    const created = await prisma.notificacion.count({
      where: {
        titulo: 'Intento no autorizado',
        creadoPorId: {
          in: [socio.userId, postulante.userId],
        },
      },
    });

    expect(created).toBe(0);
  });

  it('solo el administrador ve todas las notificaciones enviadas', async () => {
    const response = await request(app)
      .get('/notificaciones')
      .set('Cookie', socio.cookie);

    expect(response.status).toBe(403);
  });

  it('debería rechazar una notificación con título que no es texto', async () => {
    const response = await request(app)
      .post('/notificaciones')
      .set('Cookie', admin.cookie)
      .send({
        titulo: 123,
        mensaje: 'Mensaje',
        tipo: 'NORMAL',
        destinatarioTipo: 'USUARIOS',
        usuarioIds: [postulante.userId],
      });

    expect(response.status).toBe(400);
  });

  describe('destinatarios y seguridad', () => {
    it('ADMIN puede consultar el historial global', async () => {
      await request(app)
        .post('/notificaciones')
        .set('Cookie', admin.cookie)
        .send({
          titulo: 'Historial admin',
          mensaje: 'Visible en historial',
          tipo: 'NORMAL',
          destinatarioTipo: 'USUARIOS',
          usuarioIds: [postulante.userId],
        })
        .expect(201);

      const response = await request(app)
        .get('/notificaciones')
        .set('Cookie', admin.cookie);

      expect(response.status).toBe(200);
      expect(
        response.body.some(
          (notification: { titulo: string }) =>
            notification.titulo === 'Historial admin',
        ),
      ).toBe(true);
    });

    it('USUARIOS entrega exactamente a los IDs elegidos y no a terceros', async () => {
      const segundo = await createApplicant();

      try {
        const created = await request(app)
          .post('/notificaciones')
          .set('Cookie', admin.cookie)
          .send({
            titulo: 'Dos destinatarios',
            mensaje: 'Solo para dos',
            tipo: 'NORMAL',
            destinatarioTipo: 'USUARIOS',
            usuarioIds: [postulante.userId, socio.userId],
          });

        expect(created.status).toBe(201);
        expect(created.body.destinatarios).toHaveLength(2);
        expect(
          created.body.destinatarios
            .map((item: { usuario: { id: number } }) => item.usuario.id)
            .sort((a: number, b: number) => a - b),
        ).toEqual([postulante.userId, socio.userId].sort((a, b) => a - b));

        const thirdInbox = await request(app)
          .get('/notificaciones/recibidas')
          .set('Cookie', segundo.cookie);

        expect(thirdInbox.status).toBe(200);
        expect(
          thirdInbox.body.some(
            (item: { notificacion: { titulo: string } }) =>
              item.notificacion.titulo === 'Dos destinatarios',
          ),
        ).toBe(false);
      } finally {
        await deleteUsers([segundo.userId]);
      }
    });

    it('USUARIOS rechaza una selección vacía', async () => {
      const response = await request(app)
        .post('/notificaciones')
        .set('Cookie', admin.cookie)
        .send({
          titulo: 'Sin destinatarios',
          mensaje: 'No debe crearse',
          tipo: 'NORMAL',
          destinatarioTipo: 'USUARIOS',
          usuarioIds: [],
        });

      expect(response.status).toBe(400);
    });

    it('un usuario no puede marcar como leída una notificación ajena', async () => {
      const created = await request(app)
        .post('/notificaciones')
        .set('Cookie', admin.cookie)
        .send({
          titulo: 'Privada',
          mensaje: 'Solo postulante',
          tipo: 'NORMAL',
          destinatarioTipo: 'USUARIOS',
          usuarioIds: [postulante.userId],
        });

      expect(created.status).toBe(201);

      const response = await request(app)
        .patch(`/notificaciones/${created.body.id}/leida`)
        .set('Cookie', socio.cookie);

      expect(response.status).toBe(404);
      expect(response.body.message).toBe('Notificación no encontrada');

      const recipient = await prisma.notificacionUsuario.findUnique({
        where: {
          notificacionId_usuarioId: {
            notificacionId: created.body.id,
            usuarioId: postulante.userId,
          },
        },
      });

      expect(recipient!.leida).toBe(false);
    });

    it('quien recibe una notificación no ve el email ni el ID de quien la creó', async () => {
      await request(app)
        .post('/notificaciones')
        .set('Cookie', admin.cookie)
        .send({
          titulo: 'Sin datos del creador',
          mensaje: 'Mensaje',
          tipo: 'EMERGENTE',
          destinatarioTipo: 'USUARIOS',
          usuarioIds: [postulante.userId],
        });

      for (const path of ['recibidas', 'emergentes']) {
        const response = await request(app)
          .get(`/notificaciones/${path}`)
          .set('Cookie', postulante.cookie);

        expect(response.status).toBe(200);
        expect(response.body.length).toBeGreaterThan(0);

        for (const item of response.body) {
          expect(item.notificacion).not.toHaveProperty('creadoPorId');
          expect(item.notificacion.creadoPor ?? {}).not.toHaveProperty('email');
          expect(item.notificacion.creadoPor ?? {}).not.toHaveProperty('id');
        }
      }

      const [received] = (
        await request(app)
          .get('/notificaciones/recibidas')
          .set('Cookie', postulante.cookie)
      ).body;

      expect(received.notificacion.creadoPor).toEqual({ tipo: 'ADMIN' });
    });

    it('rechaza título o mensaje demasiado largos sin errores internos', async () => {
      const response = await request(app)
        .post('/notificaciones')
        .set('Cookie', admin.cookie)
        .send({
          titulo: 'x'.repeat(151),
          mensaje: 'Mensaje',
          destinatarioTipo: 'TODOS',
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe(
        'El título no puede superar los 150 caracteres',
      );
    });

    it('marcar con un ID que no es entero responde 400', async () => {
      const response = await request(app)
        .patch('/notificaciones/1.5/leida')
        .set('Cookie', postulante.cookie);

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('ID inválido');
    });
  });
});
