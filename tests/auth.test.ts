import request from 'supertest';
import argon2 from 'argon2';
import jwt from 'jsonwebtoken';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import app from '../src/app';
import { prisma } from '../src/config/prisma';
import { createUser, deleteUsers, TEST_PASSWORD, uniqueEmail } from './session';

describe('Auth', () => {
  let userId: number;
  let inactiveUserId: number;

  let email: string;
  const password = TEST_PASSWORD;

  beforeAll(async () => {
    const user = await createUser({
      tipo: 'POSTULANTE',
      loginEnabled: true,
      password,
      email: uniqueEmail('auth-test'),
    });

    userId = user.userId;
    email = user.email;
  });

  afterAll(async () => {
    if (userId) {
      await deleteUsers([userId]);
    }

    if (inactiveUserId) {
      await prisma.usuario.deleteMany({
        where: {
          id: inactiveUserId,
        },
      });
    }

    await prisma.$disconnect();
  });

  it('POST /auth/login inicia sesión con credenciales correctas', async () => {
    const response = await request(app).post('/auth/login').send({
      email,
      password,
    });

    expect(response.status).toBe(200);

    expect(response.body).toHaveProperty('user');
    expect(response.body.user.id).toBe(userId);
    expect(response.body.user.email).toBe(email);
    expect(response.body.user.tipo).toBe('POSTULANTE');

    expect(response.body.user).not.toHaveProperty('password');

    expect(response.headers['set-cookie']).toBeDefined();
  });

  it('POST /auth/login falla con contraseña incorrecta', async () => {
    const response = await request(app).post('/auth/login').send({
      email,
      password: 'incorrecta',
    });

    expect(response.status).toBe(401);

    expect(response.body).toHaveProperty('message', 'Credenciales inválidas');
  });

  it('POST /auth/login falla si el usuario no existe', async () => {
    const response = await request(app)
      .post('/auth/login')
      .send({
        email: `no-existe-${Date.now()}@ccisj.uy`,
        password,
      });

    expect(response.status).toBe(401);

    expect(response.body).toHaveProperty('message', 'Credenciales inválidas');
  });

  it('POST /auth/login falla si faltan credenciales', async () => {
    const response = await request(app).post('/auth/login').send({
      email,
    });

    expect(response.status).toBe(400);

    expect(response.body).toHaveProperty(
      'message',
      'Email y contraseña son obligatorios',
    );
  });

  it('POST /auth/login falla si el usuario está inactivo', async () => {
    const inactiveEmail = `auth-inactivo-${Date.now()}@ccisj.uy`;
    const inactivePassword = 'Test123456';

    const passwordHash = await argon2.hash(inactivePassword);

    const inactiveUser = await prisma.usuario.create({
      data: {
        email: inactiveEmail,
        password: passwordHash,
        tipo: 'POSTULANTE',
        activo: false,
      },
    });

    inactiveUserId = inactiveUser.id;

    const response = await request(app).post('/auth/login').send({
      email: inactiveEmail,
      password: inactivePassword,
    });

    expect(response.status).toBe(401);

    expect(response.body).toHaveProperty('message', 'Usuario inactivo');
  });

  it('GET /auth/me devuelve 401 sin autenticación', async () => {
    const response = await request(app).get('/auth/me');

    expect(response.status).toBe(401);

    expect(response.body).toHaveProperty('message', 'No autenticado');
  });

  it('GET /auth/me devuelve 401 con token inválido', async () => {
    const response = await request(app)
      .get('/auth/me')
      .set('Cookie', ['token=token-invalido']);

    expect(response.status).toBe(401);

    expect(response.body).toHaveProperty(
      'message',
      'Sesión inválida o expirada',
    );
  });

  it('GET /auth/me devuelve el usuario autenticado', async () => {
    const agent = request.agent(app);

    await agent
      .post('/auth/login')
      .send({
        email,
        password,
      })
      .expect(200);

    const response = await agent.get('/auth/me');

    expect(response.status).toBe(200);

    expect(response.body).toHaveProperty('user');
    expect(response.body.user.id).toBe(userId);
    expect(response.body.user.email).toBe(email);
    expect(response.body.user.tipo).toBe('POSTULANTE');
    expect(response.body.user.memberType).toBeNull();

    expect(response.body.user).not.toHaveProperty('password');
  });

  it('POST /auth/logout cierra la sesión', async () => {
    const agent = request.agent(app);

    await agent
      .post('/auth/login')
      .send({
        email,
        password,
      })
      .expect(200);

    const logoutResponse = await agent.post('/auth/logout');

    expect(logoutResponse.status).toBe(200);

    expect(logoutResponse.body).toHaveProperty(
      'message',
      'Sesión cerrada correctamente',
    );

    const meResponse = await agent.get('/auth/me');

    expect(meResponse.status).toBe(401);

    expect(meResponse.body).toHaveProperty('message', 'No autenticado');
  });

  it('POST /auth/login no revela que la cuenta está inactiva sin la contraseña correcta', async () => {
    const response = await request(app)
      .post('/auth/login')
      .send({
        email: `auth-inactivo-sin-pass-${Date.now()}@ccisj.uy`,
        password: 'cualquiera',
      });

    expect(response.status).toBe(401);
    expect(response.body).toHaveProperty('message', 'Credenciales inválidas');

    const inactive = await prisma.usuario.create({
      data: {
        email: `auth-inactivo-2-${Date.now()}@ccisj.uy`,
        password: await argon2.hash(password),
        tipo: 'POSTULANTE',
        activo: false,
      },
    });

    try {
      const wrongPassword = await request(app).post('/auth/login').send({
        email: inactive.email,
        password: 'incorrecta',
      });

      expect(wrongPassword.status).toBe(401);
      expect(wrongPassword.body).toHaveProperty(
        'message',
        'Credenciales inválidas',
      );
    } finally {
      await prisma.usuario.delete({ where: { id: inactive.id } });
    }
  });

  it('POST /auth/login rechaza credenciales que no son texto', async () => {
    const response = await request(app)
      .post('/auth/login')
      .send({
        email: { contains: '@' },
        password,
      });

    expect(response.status).toBe(400);
  });

  it('GET /auth/me deja de aceptar la sesión en cuanto se desactiva el usuario', async () => {
    const agent = request.agent(app);

    await agent.post('/auth/login').send({ email, password }).expect(200);

    await prisma.usuario.update({
      where: { id: userId },
      data: { activo: false },
    });

    try {
      const response = await agent.get('/auth/me');

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty(
        'message',
        'Sesión inválida o expirada',
      );
    } finally {
      await prisma.usuario.update({
        where: { id: userId },
        data: { activo: true },
      });
    }
  });

  it('GET /auth/me rechaza un token firmado con otro secreto', async () => {
    const forged = jwt.sign({ id: userId }, 'otro-secreto', {
      algorithm: 'HS256',
    });

    const response = await request(app)
      .get('/auth/me')
      .set('Cookie', [`token=${forged}`]);

    expect(response.status).toBe(401);
  });

  it('GET /auth/me rechaza un token sin firma (alg none)', async () => {
    const encode = (value: object) =>
      Buffer.from(JSON.stringify(value)).toString('base64url');

    const unsigned = `${encode({ alg: 'none', typ: 'JWT' })}.${encode({ id: userId })}.`;

    const response = await request(app)
      .get('/auth/me')
      .set('Cookie', [`token=${unsigned}`]);

    expect(response.status).toBe(401);
  });

  describe('cambiar contraseña', () => {
    const NEW_PASSWORD = 'NuevaClave2026';

    let account: Awaited<ReturnType<typeof createUser>>;

    beforeAll(async () => {
      account = await createUser({
        tipo: 'SOCIO',
        loginEnabled: true,
        email: uniqueEmail('auth-test-password'),
      });
    });

    afterAll(async () => {
      if (account) await deleteUsers([account.userId]);
    });

    const change = (body: unknown, cookie = account.cookie) =>
      request(app)
        .post('/auth/cambiar-contrasena')
        .set('Cookie', cookie)
        .send(body as object);

    it('pide sesión', async () => {
      const response = await request(app)
        .post('/auth/cambiar-contrasena')
        .send({ passwordActual: TEST_PASSWORD, passwordNueva: NEW_PASSWORD });

      expect(response.status).toBe(401);
    });

    it.each([
      ['sin contraseña actual', { passwordNueva: NEW_PASSWORD }],
      ['sin contraseña nueva', { passwordActual: TEST_PASSWORD }],
      [
        'una nueva de menos de 10 caracteres',
        { passwordActual: TEST_PASSWORD, passwordNueva: 'Corta123' },
      ],
      [
        'una nueva sin números',
        { passwordActual: TEST_PASSWORD, passwordNueva: 'SoloLetrasLargas' },
      ],
      [
        'una nueva sin letras',
        { passwordActual: TEST_PASSWORD, passwordNueva: '12345678901' },
      ],
      [
        'una nueva de más de 128 caracteres',
        {
          passwordActual: TEST_PASSWORD,
          passwordNueva: `a1${'x'.repeat(127)}`,
        },
      ],
      [
        'una nueva igual a la actual',
        { passwordActual: TEST_PASSWORD, passwordNueva: TEST_PASSWORD },
      ],
      [
        'valores que no son texto',
        { passwordActual: { $ne: '' }, passwordNueva: NEW_PASSWORD },
      ],
    ])('rechaza %s', async (_label, body) => {
      const response = await change(body);

      expect(response.status).toBe(400);
    });

    it('rechaza un body que no es un objeto', async () => {
      const response = await change([TEST_PASSWORD, NEW_PASSWORD]);

      expect(response.status).toBe(400);
    });

    it('rechaza una contraseña actual incorrecta y no cambia nada', async () => {
      const response = await change({
        passwordActual: 'NoEsLaClave123',
        passwordNueva: NEW_PASSWORD,
      });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('La contraseña actual no es correcta');

      const stored = await prisma.usuario.findUnique({
        where: { id: account.userId },
      });

      expect(await argon2.verify(stored!.password, TEST_PASSWORD)).toBe(true);
      expect(stored!.passwordActualizada).toBeNull();
    });

    it('cambia la contraseña, mantiene esta sesión y cierra las demás', async () => {
      const current = request.agent(app);
      const otherDevice = request.agent(app);

      await current
        .post('/auth/login')
        .send({ email: account.email, password: TEST_PASSWORD })
        .expect(200);

      await otherDevice
        .post('/auth/login')
        .send({ email: account.email, password: TEST_PASSWORD })
        .expect(200);

      // El token tiene precisión de segundos: la otra sesión tiene que ser
      // de un segundo anterior al cambio.
      await new Promise((resolve) => setTimeout(resolve, 1100));

      const response = await current
        .post('/auth/cambiar-contrasena')
        .send({ passwordActual: TEST_PASSWORD, passwordNueva: NEW_PASSWORD });

      expect(response.status).toBe(200);
      expect(response.headers['set-cookie']?.[0]).toMatch(/^token=/);
      expect(JSON.stringify(response.body)).not.toContain(NEW_PASSWORD);

      expect((await current.get('/auth/me')).status).toBe(200);
      expect((await otherDevice.get('/auth/me')).status).toBe(401);

      // Una cookie firmada antes del cambio tampoco vale.
      expect(
        (await request(app).get('/auth/me').set('Cookie', account.cookie))
          .status,
      ).toBe(401);

      const stored = await prisma.usuario.findUnique({
        where: { id: account.userId },
      });

      expect(stored!.password).not.toBe(NEW_PASSWORD);
      expect(await argon2.verify(stored!.password, NEW_PASSWORD)).toBe(true);
      expect(stored!.passwordActualizada).toBeInstanceOf(Date);

      const oldLogin = await request(app)
        .post('/auth/login')
        .send({ email: account.email, password: TEST_PASSWORD });

      expect(oldLogin.status).toBe(401);

      const newSession = request.agent(app);

      await newSession
        .post('/auth/login')
        .send({ email: account.email, password: NEW_PASSWORD })
        .expect(200);

      expect((await newSession.get('/auth/me')).status).toBe(200);
    });
  });
});
