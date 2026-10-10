/**
 * Pruebas de los rate limits.
 *
 * En el resto de la suite están apagados (`rateLimitApagado`), porque todos
 * los requests salen de la misma IP. Acá se encienden para probar que cortan
 * donde dicen: hasta ahora la configuración estaba escrita, pero ningún test
 * la ejecutaba.
 *
 * Cada archivo de test carga su propia instancia de la app, así que los
 * contadores de este archivo no se mezclan con los de otros. Dentro del
 * archivo, cada límite tiene su propio contador; el global los cuenta a todos.
 */
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import app from '../src/app';
import { prisma } from '../src/config/prisma';
import { LIMITE_GLOBAL_POR_MINUTO } from '../src/middlewares/rate-limit';
import { TEST_PASSWORD, createUser, deleteUsers, uniqueEmail } from './session';

beforeAll(() => {
  vi.stubEnv('PROBAR_RATE_LIMIT', '1');
});

afterAll(() => {
  vi.unstubAllEnvs();
});

describe('Rate limit del login', () => {
  let account: Awaited<ReturnType<typeof createUser>>;

  beforeAll(async () => {
    account = await createUser({
      tipo: 'POSTULANTE',
      loginEnabled: true,
      email: uniqueEmail('rate-limit-login'),
    });
  });

  afterAll(async () => {
    await deleteUsers([account.userId]);
  });

  const login = (password: string) =>
    request(app).post('/auth/login').send({ email: account.email, password });

  it('corta en el intento fallido número 11, y los logins correctos no cuentan', async () => {
    for (let i = 0; i < 9; i++) {
      expect((await login('incorrecta')).status).toBe(401);
    }

    // Tres logins correctos en el medio: si contaran, el límite llegaría antes.
    for (let i = 0; i < 3; i++) {
      expect((await login(TEST_PASSWORD)).status).toBe(200);
    }

    expect((await login('incorrecta')).status).toBe(401);

    // Diez fallidos: el siguiente se corta, aunque traiga la contraseña
    // correcta. El límite frena antes de llegar a comprobarla.
    const blocked = await login(TEST_PASSWORD);

    expect(blocked.status).toBe(429);
    expect(blocked.body.message).toBe(
      'Demasiados intentos de inicio de sesión. Intente nuevamente en unos minutos.',
    );
    expect(blocked.headers['set-cookie']).toBeUndefined();
  });
});

describe('Rate limit del registro', () => {
  const createdEmails: string[] = [];

  afterAll(async () => {
    const users = await prisma.usuario.findMany({
      where: { email: { in: createdEmails } },
      select: { id: true },
    });

    await deleteUsers(users.map((user) => user.id));
  });

  function register(overrides: Record<string, unknown> = {}) {
    const email = uniqueEmail('rate-limit-registro').toLowerCase();
    createdEmails.push(email);

    return request(app)
      .post('/auth/registro')
      .send({
        email,
        password: TEST_PASSWORD,
        nombre: 'Ana',
        apellido: 'Pérez',
        ...overrides,
      });
  }

  it('corta en la cuenta número 6, y los intentos con errores no cuentan', async () => {
    // Un formulario con errores no suma: corregirlo no tiene que dejar a nadie
    // bloqueado.
    expect((await register({ password: 'corta' })).status).toBe(400);

    for (let i = 0; i < 5; i++) {
      expect((await register()).status).toBe(201);
    }

    const blocked = await register();

    expect(blocked.status).toBe(429);
    expect(blocked.body.message).toBe(
      'Demasiados registros desde esta conexión. Intente nuevamente más tarde.',
    );
  });
});

describe('Rate limit del cambio de contraseña', () => {
  let account: Awaited<ReturnType<typeof createUser>>;
  let otherAccount: Awaited<ReturnType<typeof createUser>>;

  beforeAll(async () => {
    account = await createUser({ tipo: 'SOCIO', loginEnabled: true });
    otherAccount = await createUser({ tipo: 'SOCIO', loginEnabled: true });
  });

  afterAll(async () => {
    await deleteUsers([account.userId, otherAccount.userId]);
  });

  const change = (cookie: typeof account.cookie) =>
    request(app).post('/auth/cambiar-contrasena').set('Cookie', cookie).send({
      passwordActual: 'NoEsLaClave123',
      passwordNueva: 'NuevaClave2026',
    });

  it('corta en el intento fallido número 6 de la misma cuenta', async () => {
    for (let i = 0; i < 5; i++) {
      expect((await change(account.cookie)).status).toBe(400);
    }

    const blocked = await change(account.cookie);

    expect(blocked.status).toBe(429);
    expect(blocked.body.message).toBe(
      'Demasiados intentos de cambio de contraseña. Intente nuevamente en unos minutos.',
    );
  });

  it('cuenta por cuenta y no por IP: otra cuenta desde la misma conexión sigue pudiendo', async () => {
    // Si contara por IP, un usuario podría bloquearle el cambio de contraseña
    // a todos los que comparten su conexión.
    expect((await change(otherAccount.cookie)).status).toBe(400);
  });
});

describe('Rate limit general de la API', () => {
  /** Lo que queda en la ventana, según la cabecera `RateLimit` (draft-8). */
  function remaining(header: string | undefined) {
    const match = header?.match(/;\s*r=(\d+)/);

    if (!match) {
      throw new Error(`Cabecera RateLimit inesperada: ${header}`);
    }

    return Number(match[1]);
  }

  it('anuncia el límite en las cabeceras de cada respuesta', async () => {
    const response = await request(app).get('/');

    // Al final va una clave de partición (`pk`) que depende de la IP.
    expect(response.headers['ratelimit-policy']).toMatch(
      new RegExp(
        `^"${LIMITE_GLOBAL_POR_MINUTO}-in-1min"; q=${LIMITE_GLOBAL_POR_MINUTO}; w=60;`,
      ),
    );
    expect(response.headers.ratelimit).toMatch(/;\s*r=\d+;\s*t=\d+$/);
  });

  it('corta al superar los pedidos por minuto, también en la bolsa de trabajo pública', async () => {
    // Los otros escenarios de este archivo ya usaron parte de la ventana, así
    // que se lee cuánto queda en vez de suponerlo.
    const first = await request(app).get('/');
    let left = remaining(first.headers.ratelimit);

    while (left > 0) {
      const response = await request(app).get('/');

      expect(response.status).toBe(200);
      left = remaining(response.headers.ratelimit);
    }

    // Con el `Origin` del frontend: el 429 tiene que salir con las cabeceras de
    // CORS, porque si no el navegador le esconde la respuesta a la aplicación
    // y el usuario ve un error de red en vez del mensaje.
    const blocked = await request(app)
      .get('/ofertas')
      .set('Origin', 'http://localhost:5173');

    expect(blocked.status).toBe(429);
    expect(blocked.body.message).toBe(
      'Demasiadas solicitudes. Intente nuevamente en un minuto.',
    );
    expect(blocked.headers['retry-after']).toMatch(/^\d+$/);
    expect(blocked.headers['access-control-allow-origin']).toBe(
      'http://localhost:5173',
    );
  });
});
