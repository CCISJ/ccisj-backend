import request from 'supertest';
import argon2 from 'argon2';
import jwt from 'jsonwebtoken';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import app from '@/app';
import { prisma } from '@/config/prisma';

describe('Auth', () => {
  let userId: number;
  let inactiveUserId: number;

  const email = `auth-test-${Date.now()}@ccisj.uy`;
  const password = 'Test123456';

  beforeAll(async () => {
    const passwordHash = await argon2.hash(password);

    const user = await prisma.usuario.create({
      data: {
        email,
        password: passwordHash,
        tipo: 'POSTULANTE',
      },
    });

    userId = user.id;
  });

  afterAll(async () => {
    if (userId) {
      await prisma.usuario.deleteMany({
        where: {
          id: userId,
        },
      });
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
});
