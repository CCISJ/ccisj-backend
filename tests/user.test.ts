import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import app from '../src/app';
import { prisma } from '../src/config/prisma';
import {
  createAdmin,
  createApplicant,
  createLoggedUser,
  createMember,
  deleteUsers,
  uniqueEmail,
} from './session';

describe('Usuarios', () => {
  let admin: Awaited<ReturnType<typeof createAdmin>>;

  beforeAll(async () => {
    admin = await createAdmin();
  });

  let createdUserId: number;
  const testEmail = `usuario-test-${Date.now()}@ccisj.uy`;

  afterAll(async () => {
    if (createdUserId) {
      await prisma.usuario.deleteMany({
        where: {
          id: createdUserId,
        },
      });
    }

    await deleteUsers([admin.userId]);

    await prisma.$disconnect();
  });

  it('GET /usuarios devuelve una lista de usuarios', async () => {
    const response = await request(app)
      .get('/usuarios')
      .set('Cookie', admin.cookie);

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
  });

  it('GET /usuarios/:id devuelve un usuario existente', async () => {
    const existingUser = await prisma.usuario.findFirst();

    expect(existingUser).not.toBeNull();

    const response = await request(app)
      .get(`/usuarios/${existingUser!.id}`)
      .set('Cookie', admin.cookie);

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('id', existingUser!.id);
    expect(response.body).toHaveProperty('email');
    expect(response.body).toHaveProperty('tipo');

    // La contraseña no debería exponerse
    expect(response.body).not.toHaveProperty('password');
  });

  it('GET /usuarios/:id devuelve 404 si no existe', async () => {
    const response = await request(app)
      .get('/usuarios/999999')
      .set('Cookie', admin.cookie);

    expect(response.status).toBe(404);
    expect(response.body).toHaveProperty('message');
  });

  it('GET /usuarios/:id devuelve 400 si el ID es inválido', async () => {
    const response = await request(app)
      .get('/usuarios/abc')
      .set('Cookie', admin.cookie);

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty('message', 'ID inválido');
  });

  it('POST /usuarios crea un usuario', async () => {
    const response = await request(app)
      .post('/usuarios')
      .set('Cookie', admin.cookie)
      .send({
        email: testEmail,
        password: 'Garza-Mate-Rio-58',
        tipo: 'POSTULANTE',
      });

    expect(response.status).toBe(201);

    expect(response.body).toHaveProperty('id');
    expect(response.body.email).toBe(testEmail);
    expect(response.body.tipo).toBe('POSTULANTE');
    expect(response.body.activo).toBe(true);

    // No devolver password
    expect(response.body).not.toHaveProperty('password');

    createdUserId = response.body.id;
  });

  it('POST /usuarios falla si faltan datos obligatorios', async () => {
    const response = await request(app)
      .post('/usuarios')
      .set('Cookie', admin.cookie)
      .send({
        email: `incompleto-${Date.now()}@ccisj.uy`,
      });

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty(
      'message',
      'Faltan datos obligatorios',
    );
  });

  it('POST /usuarios falla si el email ya existe', async () => {
    const response = await request(app)
      .post('/usuarios')
      .set('Cookie', admin.cookie)
      .send({
        email: testEmail,
        password: 'Otra-Garza-Mate-61',
        tipo: 'POSTULANTE',
      });

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty(
      'message',
      'El email ya está registrado',
    );
  });

  it('PATCH /usuarios/:id actualiza un usuario', async () => {
    const newEmail = `usuario-actualizado-${Date.now()}@ccisj.uy`;

    const response = await request(app)
      .patch(`/usuarios/${createdUserId}`)
      .set('Cookie', admin.cookie)
      .send({
        email: newEmail,
        tipo: 'POSTULANTE',
        activo: false,
      });

    expect(response.status).toBe(200);
    expect(response.body.email).toBe(newEmail);
    expect(response.body.tipo).toBe('POSTULANTE');
    expect(response.body.activo).toBe(false);

    expect(response.body).not.toHaveProperty('password');
  });

  it('PATCH /usuarios/:id devuelve error si el usuario no existe', async () => {
    const response = await request(app)
      .patch('/usuarios/999999')
      .set('Cookie', admin.cookie)
      .send({
        email: `no-existe-${Date.now()}@ccisj.uy`,
      });

    expect(response.status).toBe(404);
    expect(response.body.message).toBe('Usuario no encontrado');
  });

  it('PATCH /usuarios/:id devuelve 400 si el ID es inválido', async () => {
    const response = await request(app)
      .patch('/usuarios/abc')
      .set('Cookie', admin.cookie)
      .send({
        activo: false,
      });

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty('message', 'ID inválido');
  });

  it('DELETE /usuarios/:id elimina un usuario', async () => {
    const response = await request(app)
      .delete(`/usuarios/${createdUserId}`)
      .set('Cookie', admin.cookie);

    expect(response.status).toBe(204);

    const deletedUser = await prisma.usuario.findUnique({
      where: {
        id: createdUserId,
      },
    });

    expect(deletedUser).toBeNull();

    createdUserId = 0;
  });

  it('DELETE /usuarios/:id devuelve 404 si no existe', async () => {
    const response = await request(app)
      .delete('/usuarios/999999')
      .set('Cookie', admin.cookie);

    expect(response.status).toBe(404);
    expect(response.body).toHaveProperty('message');
  });

  it('DELETE /usuarios/:id devuelve 400 si el ID es inválido', async () => {
    const response = await request(app)
      .delete('/usuarios/abc')
      .set('Cookie', admin.cookie);

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty('message', 'ID inválido');
  });

  it('POST /usuarios guarda la contraseña hasheada, nunca en texto plano', async () => {
    const response = await request(app)
      .post('/usuarios')
      .set('Cookie', admin.cookie)
      .send({
        email: `usuario-hash-${Date.now()}@ccisj.uy`,
        password: 'clave-en-claro-lechuza-1',
        tipo: 'POSTULANTE',
      });

    expect(response.status).toBe(201);

    const stored = await prisma.usuario.findUnique({
      where: { id: response.body.id },
    });

    try {
      expect(stored!.password).not.toBe('clave-en-claro-lechuza-1');
      expect(stored!.password.startsWith('$argon2')).toBe(true);
    } finally {
      await prisma.usuario.delete({ where: { id: response.body.id } });
    }
  });

  it('POST /usuarios rechaza un tipo de usuario inexistente', async () => {
    const response = await request(app)
      .post('/usuarios')
      .set('Cookie', admin.cookie)
      .send({
        email: `usuario-tipo-${Date.now()}@ccisj.uy`,
        password: 'Garza-Mate-Rio-58',
        tipo: 'SUPERADMIN',
      });

    expect(response.status).toBe(400);
  });

  describe('reglas de las cuentas', () => {
    let socio: Awaited<ReturnType<typeof createMember>>;
    let postulante: Awaited<ReturnType<typeof createApplicant>>;
    const created: number[] = [];

    beforeAll(async () => {
      socio = await createMember();
      postulante = await createApplicant();
    });

    afterAll(async () => {
      await deleteUsers([socio.userId, postulante.userId, ...created]);
    });

    function createUser(body: Record<string, unknown>) {
      return request(app)
        .post('/usuarios')
        .set('Cookie', admin.cookie)
        .send(body);
    }

    it('la contraseña cumple las mismas reglas que al cambiarla', async () => {
      const email = `usuario-reglas-${Date.now()}@ccisj.uy`;

      const cases = [
        ['Faro-Tilo-1', 'La contraseña debe tener al menos 12 caracteres'],
        [
          'sinnumerosninada',
          'La contraseña debe tener al menos una letra y un número',
        ],
        [
          '123456789012',
          'La contraseña debe tener al menos una letra y un número',
        ],
      ];

      for (const [password, message] of cases) {
        const response = await createUser({
          email,
          password,
          tipo: 'POSTULANTE',
        });

        expect(response.status).toBe(400);
        expect(response.body.message).toBe(message);
      }
    });

    it('rechaza una contraseña armada con el email', async () => {
      const response = await createUser({
        email: uniqueEmail('zorbatelo'),
        password: 'Zorbatelo2026',
        tipo: 'POSTULANTE',
      });

      expect(response.status).toBe(400);
      expect(response.body.message).toMatch(
        'La contraseña es fácil de adivinar',
      );
    });

    it('valida el formato del email y lo guarda en minúsculas', async () => {
      const invalid = await createUser({
        email: 'no-es-un-email',
        password: 'Garza-Mate-Rio-58',
        tipo: 'POSTULANTE',
      });

      expect(invalid.status).toBe(400);
      expect(invalid.body.message).toBe('El email no es válido');

      const suffix = Date.now();
      const response = await createUser({
        email: `  Usuario.Mayus-${suffix}@CCISJ.uy `,
        password: 'Garza-Mate-Rio-58',
        tipo: 'POSTULANTE',
      });

      expect(response.status).toBe(201);
      created.push(response.body.id);
      expect(response.body.email).toBe(`usuario.mayus-${suffix}@ccisj.uy`);

      // El mismo email con otras mayúsculas es un repetido.
      const duplicate = await createUser({
        email: `USUARIO.MAYUS-${suffix}@ccisj.uy`,
        password: 'Garza-Mate-Rio-58',
        tipo: 'POSTULANTE',
      });

      expect(duplicate.status).toBe(400);
      expect(duplicate.body.message).toBe('El email ya está registrado');
    });

    it('no crea cuentas de socio sueltas, sin su empresa', async () => {
      const response = await createUser({
        email: `socio-suelto-${Date.now()}@ccisj.uy`,
        password: 'Garza-Mate-Rio-58',
        tipo: 'SOCIO',
      });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe(
        'Las cuentas de socio se crean desde la sección Socios',
      );
    });

    it('no cambia el tipo de una cuenta con ficha de socio o postulante', async () => {
      for (const userId of [socio.userId, postulante.userId]) {
        const response = await request(app)
          .patch(`/usuarios/${userId}`)
          .set('Cookie', admin.cookie)
          .send({ tipo: 'ADMIN' });

        expect(response.status).toBe(400);
        expect(response.body.message).toBe(
          'No se puede cambiar el tipo de una cuenta que tiene ficha de socio o de postulante',
        );
      }

      const stored = await prisma.usuario.findUnique({
        where: { id: socio.userId },
      });

      expect(stored!.tipo).toBe('SOCIO');
    });

    it('un socio se da de baja desde Socios, no desde Usuarios', async () => {
      const deactivate = await request(app)
        .patch(`/usuarios/${socio.userId}`)
        .set('Cookie', admin.cookie)
        .send({ activo: false });

      expect(deactivate.status).toBe(400);
      expect(deactivate.body.message).toBe(
        'Para dar de baja un socio usá la sección Socios: así también se cierran sus ofertas',
      );

      // Reactivar sí se hace desde acá.
      await prisma.usuario.update({
        where: { id: socio.userId },
        data: { activo: false },
      });

      const reactivate = await request(app)
        .patch(`/usuarios/${socio.userId}`)
        .set('Cookie', admin.cookie)
        .send({ activo: true });

      expect(reactivate.status).toBe(200);
      expect(reactivate.body.activo).toBe(true);
    });

    it('el administrador no se quita el acceso a sí mismo', async () => {
      const demote = await request(app)
        .patch(`/usuarios/${admin.userId}`)
        .set('Cookie', admin.cookie)
        .send({ tipo: 'POSTULANTE' });

      const deactivate = await request(app)
        .patch(`/usuarios/${admin.userId}`)
        .set('Cookie', admin.cookie)
        .send({ activo: false });

      const remove = await request(app)
        .delete(`/usuarios/${admin.userId}`)
        .set('Cookie', admin.cookie);

      expect(demote.status).toBe(400);
      expect(deactivate.status).toBe(400);
      expect(remove.status).toBe(400);

      const stored = await prisma.usuario.findUnique({
        where: { id: admin.userId },
      });

      expect(stored).toMatchObject({ tipo: 'ADMIN', activo: true });
    });

    it('no elimina una cuenta con historial y lo explica', async () => {
      const response = await request(app)
        .delete(`/usuarios/${socio.userId}`)
        .set('Cookie', admin.cookie);

      expect(response.status).toBe(409);
      expect(response.body.message).toBe(
        'La cuenta tiene datos asociados (empresa, ofertas o notificaciones enviadas) y no se puede eliminar. Desactivala.',
      );
    });

    it('no reenvía mensajes internos de la base', async () => {
      const response = await request(app)
        .patch(`/usuarios/${postulante.userId}`)
        .set('Cookie', admin.cookie)
        .send({ email: `${'x'.repeat(250)}@ccisj.uy` });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('El email no es válido');
      expect(JSON.stringify(response.body)).not.toMatch(/prisma|invocation/i);
    });
  });

  describe('restablecer la contraseña', () => {
    function reset(userId: number, cookie = admin.cookie) {
      return request(app)
        .post(`/usuarios/${userId}/restablecer-contrasena`)
        .set('Cookie', cookie);
    }

    it('genera una contraseña nueva, la devuelve una vez y la vieja deja de servir', async () => {
      const cuenta = await createLoggedUser({ tipo: 'POSTULANTE' });

      try {
        const response = await reset(cuenta.userId);

        expect(response.status).toBe(200);
        expect(response.headers['cache-control']).toBe('no-store');
        expect(response.body.email).toBe(cuenta.email);
        expect(response.body.password).toMatch(/^[a-zA-Z2-9]{12}$/);
        expect(response.body.password).toMatch(/\d/);

        const vieja = await request(app)
          .post('/auth/login')
          .send({ email: cuenta.email, password: cuenta.password });
        const nueva = await request(app)
          .post('/auth/login')
          .send({ email: cuenta.email, password: response.body.password });

        expect(vieja.status).toBe(401);
        expect(nueva.status).toBe(200);

        // Nunca se guarda en texto plano.
        const stored = await prisma.usuario.findUnique({
          where: { id: cuenta.userId },
          select: { password: true },
        });

        expect(stored?.password).toMatch(/^\$argon2/);
      } finally {
        await deleteUsers([cuenta.userId]);
      }
    });

    it('cierra las sesiones que la cuenta tenía abiertas', async () => {
      const cuenta = await createLoggedUser({ tipo: 'POSTULANTE' });

      try {
        expect((await cuenta.agent.get('/auth/me')).status).toBe(200);

        expect((await reset(cuenta.userId)).status).toBe(200);

        expect((await cuenta.agent.get('/auth/me')).status).toBe(401);
      } finally {
        await deleteUsers([cuenta.userId]);
      }
    });

    it('la propia no: se cambia desde Mi cuenta, con la actual', async () => {
      const response = await reset(admin.userId);

      expect(response.status).toBe(400);
      expect(response.body.message).toBe(
        'Tu propia contraseña se cambia desde Mi cuenta, con la actual',
      );
    });

    it('devuelve 404 si la cuenta no existe y 400 si el ID no es válido', async () => {
      expect((await reset(999_999_999)).status).toBe(404);

      const invalid = await request(app)
        .post('/usuarios/abc/restablecer-contrasena')
        .set('Cookie', admin.cookie);

      expect(invalid.status).toBe(400);
    });

    it('un socio directivo no puede restablecer la de nadie', async () => {
      const directivo = await createMember('DIRECTIVO');
      const otro = await createMember();

      try {
        const response = await reset(otro.userId, directivo.cookie);

        expect(response.status).toBe(403);
        expect(response.body).not.toHaveProperty('password');
      } finally {
        await deleteUsers([directivo.userId, otro.userId]);
      }
    });
  });

  describe('permisos', () => {
    let socio: Awaited<ReturnType<typeof createMember>>;
    let postulante: Awaited<ReturnType<typeof createApplicant>>;

    beforeAll(async () => {
      socio = await createMember('DIRECTIVO');
      postulante = await createApplicant();
    });

    afterAll(async () => {
      await deleteUsers([socio.userId, postulante.userId]);
    });

    it('GET /usuarios devuelve 401 sin sesión', async () => {
      const response = await request(app).get('/usuarios');

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('message', 'No autenticado');
    });

    it('un socio, aunque sea directivo, no accede a /usuarios', async () => {
      const list = await request(app)
        .get('/usuarios')
        .set('Cookie', socio.cookie);

      const create = await request(app)
        .post('/usuarios')
        .set('Cookie', socio.cookie)
        .send({
          email: `escalada-${Date.now()}@ccisj.uy`,
          password: 'Garza-Mate-Rio-58',
          tipo: 'ADMIN',
        });

      expect(list.status).toBe(403);
      expect(create.status).toBe(403);
    });

    it('un postulante no puede cambiarse el rol a sí mismo', async () => {
      const response = await request(app)
        .patch(`/usuarios/${postulante.userId}`)
        .set('Cookie', postulante.cookie)
        .send({ tipo: 'ADMIN' });

      expect(response.status).toBe(403);

      const user = await prisma.usuario.findUnique({
        where: { id: postulante.userId },
      });

      expect(user!.tipo).toBe('POSTULANTE');
    });

    it('GET /usuarios/destinatarios-notificaciones es solo para ADMIN', async () => {
      const asSocio = await request(app)
        .get('/usuarios/destinatarios-notificaciones')
        .set('Cookie', socio.cookie);

      const asPostulante = await request(app)
        .get('/usuarios/destinatarios-notificaciones')
        .set('Cookie', postulante.cookie);

      const withoutSession = await request(app).get(
        '/usuarios/destinatarios-notificaciones',
      );

      expect(asSocio.status).toBe(403);
      expect(asPostulante.status).toBe(403);
      expect(withoutSession.status).toBe(401);
    });

    it('GET /usuarios/destinatarios-notificaciones devuelve socios y postulantes activos, nunca ADMIN', async () => {
      const response = await request(app)
        .get('/usuarios/destinatarios-notificaciones')
        .set('Cookie', admin.cookie);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);

      const socioResult = response.body.find(
        (user: { id: number }) => user.id === socio.userId,
      );
      const postulanteResult = response.body.find(
        (user: { id: number }) => user.id === postulante.userId,
      );
      const adminResult = response.body.find(
        (user: { id: number }) => user.id === admin.userId,
      );

      expect(socioResult).toMatchObject({
        id: socio.userId,
        email: socio.email,
        tipo: 'SOCIO',
      });
      expect(socioResult.socio).toHaveProperty('razonSocial');

      expect(postulanteResult).toMatchObject({
        id: postulante.userId,
        email: postulante.email,
        tipo: 'POSTULANTE',
      });
      expect(postulanteResult.postulante).toMatchObject({
        nombre: expect.any(String),
        apellido: expect.any(String),
      });

      expect(adminResult).toBeUndefined();
      expect(
        response.body.every(
          (user: { activo?: boolean }) => !('activo' in user),
        ),
      ).toBe(true);
      expect(
        response.body.every(
          (user: { password?: string }) => !('password' in user),
        ),
      ).toBe(true);
    });

    it('GET /usuarios/destinatarios-notificaciones excluye usuarios inactivos', async () => {
      await prisma.usuario.update({
        where: { id: postulante.userId },
        data: { activo: false },
      });

      try {
        const response = await request(app)
          .get('/usuarios/destinatarios-notificaciones')
          .set('Cookie', admin.cookie);

        expect(response.status).toBe(200);
        expect(
          response.body.some(
            (user: { id: number }) => user.id === postulante.userId,
          ),
        ).toBe(false);
      } finally {
        await prisma.usuario.update({
          where: { id: postulante.userId },
          data: { activo: true },
        });
      }
    });
  });
});
