/**
 * Pruebas del registro de eventos de seguridad (`utils/security-log.ts`).
 *
 * En el resto de la suite está apagado, como los rate limits. Acá se enciende
 * con `PROBAR_REGISTRO=1` y se capturan las líneas que escribe, para probar
 * dos cosas: que cada evento queda registrado con lo necesario para
 * investigarlo, y que **nunca** quedan contraseñas, tokens ni emails tipeados.
 */
import request from 'supertest';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import app from '../src/app';
import { prisma } from '../src/config/prisma';
import {
  TEST_PASSWORD,
  createAdmin,
  createApplicant,
  createUser,
  deleteUsers,
  sessionCookie,
  uniqueBps,
  uniqueEmail,
} from './session';

type Evento = Record<string, unknown> & { evento: string };

let lineas: string[] = [];

function capturar(...args: unknown[]) {
  if (typeof args[0] === 'string' && args[0].includes('"tipo":"seguridad"')) {
    lineas.push(args[0]);
  }
}

function eventos(nombre?: string): Evento[] {
  const todos = lineas.map((linea) => JSON.parse(linea) as Evento);

  return nombre ? todos.filter((e) => e.evento === nombre) : todos;
}

const usersToDelete: number[] = [];

beforeAll(() => {
  vi.stubEnv('PROBAR_REGISTRO', '1');
});

beforeEach(() => {
  lineas = [];
  vi.spyOn(console, 'info').mockImplementation(capturar);
  vi.spyOn(console, 'warn').mockImplementation(capturar);
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  vi.unstubAllEnvs();
  await deleteUsers(usersToDelete);
});

async function cuentaConLogin(tipo: 'ADMIN' | 'POSTULANTE' = 'POSTULANTE') {
  const user = await createUser({
    tipo,
    loginEnabled: true,
    email: uniqueEmail('registro-seguridad'),
  });

  usersToDelete.push(user.userId);

  return user;
}

describe('Formato del registro', () => {
  it('cada evento es una sola línea JSON con fecha, IP, ruta y cuenta', async () => {
    const user = await cuentaConLogin();

    await request(app)
      .post('/auth/login?origen=prueba')
      .send({ email: user.email, password: user.password });

    expect(lineas).toHaveLength(1);
    expect(lineas[0]).not.toContain('\n');

    const [evento] = eventos();

    expect(evento).toMatchObject({
      tipo: 'seguridad',
      nivel: 'info',
      evento: 'login.ok',
      metodo: 'POST',
      // La query no se registra: puede traer lo que alguien buscó.
      ruta: '/auth/login',
      usuarioId: user.userId,
      rol: 'POSTULANTE',
    });
    expect(typeof evento.ip).toBe('string');
    expect(Number.isNaN(Date.parse(evento.fecha as string))).toBe(false);
  });

  it('sin PROBAR_REGISTRO no escribe nada (así queda en el resto de la suite)', async () => {
    vi.stubEnv('PROBAR_REGISTRO', '0');

    try {
      await request(app)
        .post('/auth/login')
        .send({ email: uniqueEmail('nadie'), password: 'Cualquiera123' });

      expect(lineas).toHaveLength(0);
    } finally {
      vi.stubEnv('PROBAR_REGISTRO', '1');
    }
  });
});

describe('Login', () => {
  it('un email que no existe se registra sin el email', async () => {
    const email = uniqueEmail('no-existe');

    await request(app)
      .post('/auth/login')
      .send({ email, password: 'Secreta123456' });

    expect(eventos('login.fallido')).toEqual([
      expect.objectContaining({
        nivel: 'warn',
        motivo: 'cuenta-inexistente',
        usuarioId: null,
      }),
    ]);
    expect(lineas.join()).not.toContain(email);
    expect(lineas.join()).not.toContain('Secreta123456');
  });

  it('una contraseña incorrecta identifica la cuenta por su ID, sin la contraseña', async () => {
    const user = await cuentaConLogin();

    await request(app)
      .post('/auth/login')
      .send({ email: user.email, password: 'Incorrecta123' });

    expect(eventos('login.fallido')).toEqual([
      expect.objectContaining({ motivo: 'contrasena', usuarioId: user.userId }),
    ]);
    expect(lineas.join()).not.toContain(user.email);
    expect(lineas.join()).not.toContain('Incorrecta123');
  });

  it('una cuenta desactivada con la contraseña correcta', async () => {
    const user = await cuentaConLogin();

    await prisma.usuario.update({
      where: { id: user.userId },
      data: { activo: false },
    });

    await request(app)
      .post('/auth/login')
      .send({ email: user.email, password: user.password });

    expect(eventos('login.fallido')).toEqual([
      expect.objectContaining({
        motivo: 'cuenta-inactiva',
        usuarioId: user.userId,
      }),
    ]);
  });

  it('el login correcto no deja el token en el registro', async () => {
    const user = await cuentaConLogin();

    const response = await request(app)
      .post('/auth/login')
      .send({ email: user.email, password: user.password });

    const cookie = String(response.headers['set-cookie']);
    const token = /token=([^;]+)/.exec(cookie)![1];

    expect(eventos('login.ok')).toHaveLength(1);
    expect(lineas.join()).not.toContain(token);
    expect(lineas.join()).not.toContain(TEST_PASSWORD);
  });
});

describe('Sesiones y permisos', () => {
  it('un token con la firma falsificada', async () => {
    await request(app)
      .get('/auth/me')
      .set('Cookie', ['token=eyJhbGciOiJIUzI1NiJ9.eyJpZCI6MX0.firma-falsa']);

    expect(eventos('sesion.invalida')).toEqual([
      expect.objectContaining({
        nivel: 'warn',
        motivo: 'token',
        usuarioId: null,
      }),
    ]);
  });

  it('una sesión emitida antes de cambiar la contraseña', async () => {
    const user = await cuentaConLogin();

    // El token de `sessionCookie` se emite ahora; el cambio, un minuto después.
    await prisma.usuario.update({
      where: { id: user.userId },
      data: { passwordActualizada: new Date(Date.now() + 60_000) },
    });

    await request(app).get('/auth/me').set('Cookie', user.cookie);

    expect(eventos('sesion.invalida')).toEqual([
      expect.objectContaining({
        motivo: 'contrasena-cambiada',
        usuarioId: user.userId,
      }),
    ]);
  });

  it('una sesión de una cuenta desactivada, también en una ruta pública', async () => {
    const user = await cuentaConLogin();

    await prisma.usuario.update({
      where: { id: user.userId },
      data: { activo: false },
    });

    // La bolsa de trabajo contesta igual, pero el intento queda registrado.
    const response = await request(app)
      .get('/ofertas')
      .set('Cookie', user.cookie);

    expect(response.status).toBe(200);
    expect(eventos('sesion.invalida')).toEqual([
      expect.objectContaining({ motivo: 'cuenta', usuarioId: user.userId }),
    ]);
  });

  it('un 403 registra quién lo pidió y qué exigía la ruta', async () => {
    const postulante = await createApplicant({ withCv: false });

    usersToDelete.push(postulante.userId);

    const response = await request(app)
      .get('/usuarios')
      .set('Cookie', postulante.cookie);

    expect(response.status).toBe(403);
    expect(eventos('acceso.denegado')).toEqual([
      expect.objectContaining({
        nivel: 'warn',
        ruta: '/usuarios',
        usuarioId: postulante.userId,
        rol: 'POSTULANTE',
        requiere: 'ADMIN',
      }),
    ]);
  });

  it('sin sesión no es un acceso denegado: es un 401 sin registro', async () => {
    const response = await request(app).get('/usuarios');

    expect(response.status).toBe(401);
    expect(lineas).toHaveLength(0);
  });
});

describe('Contraseñas', () => {
  it('cambiarla, y fallar la actual, sin ninguna de las dos en el registro', async () => {
    const user = await cuentaConLogin();
    const cookie = sessionCookie(user.userId, 'POSTULANTE');

    await request(app)
      .post('/auth/cambiar-contrasena')
      .set('Cookie', cookie)
      .send({
        passwordActual: 'NoEsLaMia123',
        passwordNueva: 'NuevaClave2026',
      });

    await request(app)
      .post('/auth/cambiar-contrasena')
      .set('Cookie', cookie)
      .send({ passwordActual: user.password, passwordNueva: 'NuevaClave2026' });

    expect(eventos().map((e) => e.evento)).toEqual([
      'contrasena.fallida',
      'contrasena.cambiada',
    ]);
    expect(eventos()[1]).toMatchObject({ usuarioId: user.userId });

    for (const secreto of ['NoEsLaMia123', 'NuevaClave2026', user.password]) {
      expect(lineas.join()).not.toContain(secreto);
    }
  });
});

describe('Cambios de cuentas', () => {
  let admin: Awaited<ReturnType<typeof createAdmin>>;

  beforeAll(async () => {
    admin = await createAdmin();
    usersToDelete.push(admin.userId);
  });

  it('crear, modificar y eliminar una cuenta deja quién lo hizo y qué cambió', async () => {
    const email = uniqueEmail('cuenta-registro');

    const alta = await request(app)
      .post('/usuarios')
      .set('Cookie', admin.cookie)
      .send({ email, password: 'ClaveInicial2026', tipo: 'POSTULANTE' });

    expect(alta.status).toBe(201);
    usersToDelete.push(alta.body.id);

    const nuevoEmail = uniqueEmail('cuenta-registro-cambiada');

    await request(app)
      .patch(`/usuarios/${alta.body.id}`)
      .set('Cookie', admin.cookie)
      .send({ email: nuevoEmail, activo: false });

    await request(app)
      .delete(`/usuarios/${alta.body.id}`)
      .set('Cookie', admin.cookie);

    expect(eventos()).toEqual([
      expect.objectContaining({
        evento: 'usuario.creado',
        usuarioId: admin.userId,
        rol: 'ADMIN',
        cuentaId: alta.body.id,
        cuentaRol: 'POSTULANTE',
      }),
      expect.objectContaining({
        evento: 'usuario.modificado',
        usuarioId: admin.userId,
        cuentaId: alta.body.id,
        campos: ['email', 'activo'],
        cuentaActiva: false,
      }),
      expect.objectContaining({
        evento: 'usuario.eliminado',
        usuarioId: admin.userId,
        cuentaId: alta.body.id,
      }),
    ]);

    for (const dato of [email, nuevoEmail, 'ClaveInicial2026']) {
      expect(lineas.join()).not.toContain(dato);
    }
  });

  it('el alta y la baja de un socio, sin su contraseña inicial', async () => {
    const suffix = Date.now();

    const alta = await request(app)
      .post('/socios')
      .set('Cookie', admin.cookie)
      .send({
        razonSocial: `Empresa Registro ${suffix}`,
        titular: 'Juan Pérez',
        giroComercial: 'Ferretería',
        tipo: 'COMUN',
        rut: `RUT-REG-${suffix}`,
        numeroBps: uniqueBps(),
        fechaInicioEmpresa: '2020-01-15',
        fechaAfiliacion: '2026-09-01',
        direccion: '25 de Mayo 123',
        ciudad: 'San José',
        celular: '099123456',
        telefono: '43421234',
        email: uniqueEmail('socio-registro'),
      });

    expect(alta.status).toBe(201);

    const socio = await prisma.socio.findUniqueOrThrow({
      where: { id: alta.body.socioId },
      select: { usuarioId: true },
    });

    usersToDelete.push(socio.usuarioId);

    await request(app)
      .delete(`/socios/${alta.body.socioId}`)
      .set('Cookie', admin.cookie);

    expect(eventos()).toEqual([
      expect.objectContaining({
        evento: 'socio.alta',
        usuarioId: admin.userId,
        socioId: alta.body.socioId,
      }),
      expect.objectContaining({
        evento: 'socio.baja',
        usuarioId: admin.userId,
        socioId: alta.body.socioId,
      }),
    ]);
    expect(lineas.join()).not.toContain(alta.body.passwordInicial);
  });

  it('eliminar un postulante', async () => {
    const postulante = await createApplicant({ withCv: false });

    usersToDelete.push(postulante.userId);

    const response = await request(app)
      .delete(`/postulantes/${postulante.postulanteId}`)
      .set('Cookie', admin.cookie);

    expect(response.status).toBe(204);
    expect(eventos('postulante.eliminado')).toEqual([
      expect.objectContaining({
        usuarioId: admin.userId,
        postulanteId: postulante.postulanteId,
      }),
    ]);
  });
});

describe('Cortes por rate limit', () => {
  beforeAll(() => {
    vi.stubEnv('PROBAR_RATE_LIMIT', '1');
  });

  afterAll(() => {
    vi.stubEnv('PROBAR_RATE_LIMIT', '0');
  });

  it('se registra el primer pedido cortado, no cada uno de los que siguen', async () => {
    const user = await cuentaConLogin();

    // 10 fallidos permitidos y 4 cortados.
    for (let i = 0; i < 14; i++) {
      await request(app)
        .post('/auth/login')
        .send({ email: user.email, password: 'Incorrecta123' });
    }

    expect(eventos('login.fallido')).toHaveLength(10);
    expect(eventos('login.bloqueado')).toEqual([
      expect.objectContaining({ nivel: 'warn', limite: 10 }),
    ]);
  });
});
