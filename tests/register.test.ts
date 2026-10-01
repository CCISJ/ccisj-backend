import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';

import app from '../src/app';
import { prisma } from '../src/config/prisma';
import { TEST_PASSWORD, deleteUsers, uniqueEmail } from './session';

describe('Registro de postulantes', () => {
  const createdEmails: string[] = [];

  function newEmail() {
    const email = uniqueEmail('registro-test');
    createdEmails.push(email);
    return email;
  }

  function validBody(overrides: Record<string, unknown> = {}) {
    return {
      email: newEmail(),
      password: TEST_PASSWORD,
      nombre: 'Ana',
      apellido: 'Pérez',
      telefono: '099123456',
      ...overrides,
    };
  }

  afterAll(async () => {
    const users = await prisma.usuario.findMany({
      where: {
        email: { in: createdEmails.map((email) => email.toLowerCase()) },
      },
      select: { id: true },
    });

    await deleteUsers(users.map((user) => user.id));
    await prisma.$disconnect();
  });

  it('POST /auth/registro crea la cuenta y el perfil, y deja la sesión iniciada', async () => {
    const body = validBody();

    const response = await request(app).post('/auth/registro').send(body);

    expect(response.status).toBe(201);
    expect(response.body.user.email).toBe(body.email.toLowerCase());
    expect(response.body.user.tipo).toBe('POSTULANTE');
    expect(response.body.user).not.toHaveProperty('password');

    const cookies = response.headers['set-cookie'] as unknown as string[];
    expect(cookies.some((cookie) => cookie.startsWith('token='))).toBe(true);

    const postulante = await prisma.postulante.findFirst({
      where: { usuarioId: response.body.user.id },
    });

    expect(postulante).toMatchObject({
      nombre: 'Ana',
      apellido: 'Pérez',
      telefono: '099123456',
    });

    const me = await request(app).get('/auth/me').set('Cookie', cookies);

    expect(me.status).toBe(200);
    expect(me.body.user.displayName).toBe('Ana Pérez');
  });

  it('la contraseña se guarda cifrada y sirve para iniciar sesión', async () => {
    const body = validBody();

    await request(app).post('/auth/registro').send(body).expect(201);

    const usuario = await prisma.usuario.findFirst({
      where: { email: body.email.toLowerCase() },
    });

    expect(usuario?.password).not.toBe(body.password);

    const login = await request(app)
      .post('/auth/login')
      .send({ email: body.email, password: body.password });

    expect(login.status).toBe(200);
  });

  it('guarda el email en minúsculas', async () => {
    const email = newEmail().replace('registro', 'REGISTRO');

    const response = await request(app)
      .post('/auth/registro')
      .send(validBody({ email }));

    expect(response.status).toBe(201);
    expect(response.body.user.email).toBe(email.toLowerCase());
  });

  it('el teléfono es opcional', async () => {
    const response = await request(app)
      .post('/auth/registro')
      .send(validBody({ telefono: undefined }));

    expect(response.status).toBe(201);
  });

  it('ignora el tipo enviado en el body: siempre crea un postulante', async () => {
    const response = await request(app)
      .post('/auth/registro')
      .send(validBody({ tipo: 'ADMIN' }));

    expect(response.status).toBe(201);
    expect(response.body.user.tipo).toBe('POSTULANTE');
  });

  it('responde 409 si el email ya está registrado, sin importar mayúsculas', async () => {
    const body = validBody();

    await request(app).post('/auth/registro').send(body).expect(201);

    const response = await request(app)
      .post('/auth/registro')
      .send({ ...body, email: body.email.toUpperCase() });

    expect(response.status).toBe(409);
    expect(response.body.message).toBe('Ya existe una cuenta con ese email');
  });

  it('responde 400 si faltan datos obligatorios', async () => {
    const response = await request(app)
      .post('/auth/registro')
      .send({ email: newEmail(), password: TEST_PASSWORD });

    expect(response.status).toBe(400);
  });

  it('responde 400 si el email no es válido', async () => {
    const response = await request(app)
      .post('/auth/registro')
      .send(validBody({ email: 'no-es-un-email' }));

    expect(response.status).toBe(400);
  });

  it('responde 400 si la contraseña no cumple las reglas', async () => {
    const body = validBody({ password: 'corta1' });

    const response = await request(app).post('/auth/registro').send(body);

    expect(response.status).toBe(400);

    const usuario = await prisma.usuario.findFirst({
      where: { email: body.email.toLowerCase() },
    });

    expect(usuario).toBeNull();
  });

  it('responde 400 si un dato no es texto', async () => {
    const response = await request(app)
      .post('/auth/registro')
      .send(validBody({ nombre: { contains: 'a' } }));

    expect(response.status).toBe(400);
  });

  it('responde 400 si el nombre es demasiado largo y no deja una cuenta suelta', async () => {
    const body = validBody({ nombre: 'a'.repeat(101) });

    const response = await request(app).post('/auth/registro').send(body);

    expect(response.status).toBe(400);

    const usuario = await prisma.usuario.findFirst({
      where: { email: body.email.toLowerCase() },
    });

    expect(usuario).toBeNull();
  });
});
