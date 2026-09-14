import request from 'supertest';
import argon2 from 'argon2';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import app from '@/app';
import { prisma } from '@/config/prisma';

describe('Notificaciones', () => {
  const password = 'Test123456';

  const timestamp = Date.now();

  const adminEmail = `notification-admin-${timestamp}@ccisj.uy`;
  const socioEmail = `notification-socio-${timestamp}@ccisj.uy`;
  const postulanteEmail = `notification-postulante-${timestamp}@ccisj.uy`;

  let adminId: number;
  let socioId: number;
  let postulanteId: number;

  beforeAll(async () => {
    const passwordHash = await argon2.hash(password);

    const admin = await prisma.usuario.create({
      data: {
        email: adminEmail,
        password: passwordHash,
        tipo: 'ADMIN',
      },
    });

    const socio = await prisma.usuario.create({
      data: {
        email: socioEmail,
        password: passwordHash,
        tipo: 'SOCIO',
      },
    });

    const postulante = await prisma.usuario.create({
      data: {
        email: postulanteEmail,
        password: passwordHash,
        tipo: 'POSTULANTE',
      },
    });

    adminId = admin.id;
    socioId = socio.id;
    postulanteId = postulante.id;
  });

  // La base es compartida: solo se borran las notificaciones que creó el
  // admin de este test (sus destinatarios se van en cascada). Borrar sin
  // filtro eliminaba las notificaciones de todo el equipo.
  async function deleteTestNotifications() {
    await prisma.notificacion.deleteMany({
      where: {
        creadoPorId: adminId,
      },
    });
  }

  beforeEach(deleteTestNotifications);

  afterAll(async () => {
    await deleteTestNotifications();

    await prisma.usuario.deleteMany({
      where: {
        id: {
          in: [adminId, socioId, postulanteId],
        },
      },
    });
  });

  async function login(email: string) {
    const agent = request.agent(app);

    await agent
      .post('/auth/login')
      .send({
        email,
        password,
      })
      .expect(200);

    return agent;
  }

  it('debería crear una notificación para todos los usuarios', async () => {
    const admin = await login(adminEmail);

    const response = await admin.post('/notificaciones').send({
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
    const admin = await login(adminEmail);

    const response = await admin.post('/notificaciones').send({
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
    const admin = await login(adminEmail);

    const response = await admin.post('/notificaciones').send({
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
    const admin = await login(adminEmail);

    const response = await admin.post('/notificaciones').send({
      titulo: 'Mensaje individual',
      mensaje: 'Mensaje para un usuario específico',
      tipo: 'NORMAL',
      destinatarioTipo: 'USUARIOS',
      usuarioIds: [postulanteId],
    });

    expect(response.status).toBe(201);

    expect(response.body.destinatarios).toHaveLength(1);

    expect(response.body.destinatarios[0].usuario.id).toBe(postulanteId);
  });

  it('debería devolver las notificaciones recibidas por el usuario', async () => {
    const admin = await login(adminEmail);

    await admin.post('/notificaciones').send({
      titulo: 'Notificación recibida',
      mensaje: 'Mensaje de prueba',
      tipo: 'NORMAL',
      destinatarioTipo: 'USUARIOS',
      usuarioIds: [postulanteId],
    });

    const postulante = await login(postulanteEmail);

    const response = await postulante.get('/notificaciones/recibidas');

    expect(response.status).toBe(200);
    expect(response.body.length).toBeGreaterThan(0);

    expect(response.body[0].notificacion).toMatchObject({
      titulo: 'Notificación recibida',
      mensaje: 'Mensaje de prueba',
    });
  });

  it('debería devolver las notificaciones emergentes pendientes', async () => {
    const admin = await login(adminEmail);

    await admin.post('/notificaciones').send({
      titulo: 'Aviso importante',
      mensaje: 'Esta es una notificación emergente',
      tipo: 'EMERGENTE',
      destinatarioTipo: 'USUARIOS',
      usuarioIds: [postulanteId],
    });

    const postulante = await login(postulanteEmail);

    const response = await postulante.get('/notificaciones/emergentes');

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(1);

    expect(response.body[0].emergenteVista).toBe(false);
    expect(response.body[0].notificacion.tipo).toBe('EMERGENTE');
  });

  it('debería marcar una notificación como leída', async () => {
    const admin = await login(adminEmail);

    await admin.post('/notificaciones').send({
      titulo: 'Notificación para leer',
      mensaje: 'Mensaje de prueba',
      tipo: 'NORMAL',
      destinatarioTipo: 'USUARIOS',
      usuarioIds: [postulanteId],
    });

    const notificationUser = await prisma.notificacionUsuario.findFirst({
      where: {
        usuarioId: postulanteId,
      },
    });

    expect(notificationUser).not.toBeNull();

    const postulante = await login(postulanteEmail);

    const response = await postulante.patch(
      `/notificaciones/${notificationUser!.notificacionId}/leida`,
    );

    expect(response.status).toBe(200);
    expect(response.body.leida).toBe(true);
    expect(response.body.fechaLectura).not.toBeNull();
  });

  it('debería marcar una notificación emergente como vista', async () => {
    const admin = await login(adminEmail);

    await admin.post('/notificaciones').send({
      titulo: 'Emergente',
      mensaje: 'Mensaje emergente',
      tipo: 'EMERGENTE',
      destinatarioTipo: 'USUARIOS',
      usuarioIds: [postulanteId],
    });

    const notificationUser = await prisma.notificacionUsuario.findFirst({
      where: {
        usuarioId: postulanteId,
      },
    });

    expect(notificationUser).not.toBeNull();

    const postulante = await login(postulanteEmail);

    const response = await postulante.patch(
      `/notificaciones/${notificationUser!.notificacionId}/emergente-vista`,
    );

    expect(response.status).toBe(200);
    expect(response.body.emergenteVista).toBe(true);
    expect(response.body.fechaEmergenteVista).not.toBeNull();
  });

  it('una emergente vista no debería volver a aparecer como pendiente', async () => {
    const admin = await login(adminEmail);

    await admin.post('/notificaciones').send({
      titulo: 'Emergente única',
      mensaje: 'Debe mostrarse una sola vez',
      tipo: 'EMERGENTE',
      destinatarioTipo: 'USUARIOS',
      usuarioIds: [postulanteId],
    });

    const postulante = await login(postulanteEmail);

    const pendingResponse = await postulante.get('/notificaciones/emergentes');

    expect(pendingResponse.status).toBe(200);
    expect(pendingResponse.body).toHaveLength(1);

    const notificationId = pendingResponse.body[0].notificacion.id;

    const markResponse = await postulante.patch(
      `/notificaciones/${notificationId}/emergente-vista`,
    );

    expect(markResponse.status).toBe(200);

    const secondResponse = await postulante.get('/notificaciones/emergentes');

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

    const socio = await login(socioEmail);
    const postulante = await login(postulanteEmail);

    const asSocio = await socio.post('/notificaciones').send(payload);
    const asPostulante = await postulante.post('/notificaciones').send(payload);

    expect(asSocio.status).toBe(403);
    expect(asPostulante.status).toBe(403);

    const created = await prisma.notificacion.count({
      where: {
        titulo: 'Intento no autorizado',
        creadoPorId: {
          in: [socioId, postulanteId],
        },
      },
    });

    expect(created).toBe(0);
  });

  it('solo el administrador ve todas las notificaciones enviadas', async () => {
    const socio = await login(socioEmail);

    const response = await socio.get('/notificaciones');

    expect(response.status).toBe(403);
  });

  it('debería rechazar una notificación con título que no es texto', async () => {
    const admin = await login(adminEmail);

    const response = await admin.post('/notificaciones').send({
      titulo: 123,
      mensaje: 'Mensaje',
      tipo: 'NORMAL',
      destinatarioTipo: 'USUARIOS',
      usuarioIds: [postulanteId],
    });

    expect(response.status).toBe(400);
  });
});
