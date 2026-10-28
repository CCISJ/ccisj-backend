import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import app from '../src/app';
import { prisma } from '../src/config/prisma';
import {
  createAdmin,
  createApplicant,
  createMember,
  deleteUsers,
  uniqueSuffix,
} from './session';

// Supabase Storage se reemplaza por uno en memoria (ver storage-falso.ts):
// lo usa el enlace al PDF de un candidato.
vi.mock('../src/config/supabase', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('../src/config/supabase')>();
  const { supabaseFalso } = await import('./storage-falso.js');

  return { ...original, getSupabase: () => supabaseFalso };
});

describe('Applicants', () => {
  let admin: Awaited<ReturnType<typeof createAdmin>>;

  beforeAll(async () => {
    admin = await createAdmin();
  });

  let createdUserId: number;
  let createdApplicantId: number;

  afterAll(async () => {
    if (createdApplicantId) {
      await prisma.postulante.deleteMany({
        where: {
          id: createdApplicantId,
        },
      });
    }

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

  it('GET /postulantes devuelve una lista de postulantes', async () => {
    const response = await request(app)
      .get('/postulantes')
      .set('Cookie', admin.cookie);

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
  });

  it('GET /postulantes/:id devuelve un postulante existente', async () => {
    const existingApplicant = await prisma.postulante.findFirst();

    expect(existingApplicant).not.toBeNull();

    const response = await request(app)
      .get(`/postulantes/${existingApplicant!.id}`)
      .set('Cookie', admin.cookie);

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('id', existingApplicant!.id);
    expect(response.body).toHaveProperty('nombre');
    expect(response.body).toHaveProperty('apellido');
    expect(response.body).toHaveProperty('usuario');
  });

  it('GET /postulantes/:id devuelve 404 si no existe', async () => {
    const response = await request(app)
      .get('/postulantes/999999')
      .set('Cookie', admin.cookie);

    expect(response.status).toBe(404);
    expect(response.body).toHaveProperty('message');
  });

  it('GET /postulantes/:id devuelve 400 si el ID es inválido', async () => {
    const response = await request(app)
      .get('/postulantes/abc')
      .set('Cookie', admin.cookie);

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty('message', 'ID inválido');
  });

  it('POST /postulantes crea un postulante', async () => {
    const userResponse = await request(app)
      .post('/usuarios')
      .set('Cookie', admin.cookie)
      .send({
        email: `applicant-test-${Date.now()}@ccisj.uy`,
        password: 'Clave12345',
        tipo: 'POSTULANTE',
      });

    expect(userResponse.status).toBe(201);

    createdUserId = userResponse.body.id;

    const response = await request(app)
      .post('/postulantes')
      .set('Cookie', admin.cookie)
      .send({
        usuarioId: createdUserId,
        nombre: 'Test',
        apellido: 'Applicant',
        telefono: '099111222',
      });

    expect(response.status).toBe(201);
    expect(response.body).toHaveProperty('id');
    expect(response.body.nombre).toBe('Test');
    expect(response.body.apellido).toBe('Applicant');

    createdApplicantId = response.body.id;
  });

  it('POST /postulantes falla si faltan datos obligatorios', async () => {
    const response = await request(app)
      .post('/postulantes')
      .set('Cookie', admin.cookie)
      .send({
        nombre: 'Incompleto',
      });

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty(
      'message',
      'Faltan datos obligatorios',
    );
  });

  it('POST /postulantes falla si el usuario no existe', async () => {
    const response = await request(app)
      .post('/postulantes')
      .set('Cookie', admin.cookie)
      .send({
        usuarioId: 999999,
        nombre: 'Usuario',
        apellido: 'Inexistente',
      });

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty('message', 'Usuario no encontrado');
  });

  it('POST /postulantes falla si el usuario no es POSTULANTE', async () => {
    const userResponse = await request(app)
      .post('/usuarios')
      .set('Cookie', admin.cookie)
      .send({
        email: `admin-as-applicant-${Date.now()}@ccisj.uy`,
        password: 'Clave12345',
        tipo: 'ADMIN',
      });

    expect(userResponse.status).toBe(201);

    const wrongUserId = userResponse.body.id;

    const response = await request(app)
      .post('/postulantes')
      .set('Cookie', admin.cookie)
      .send({
        usuarioId: wrongUserId,
        nombre: 'Usuario',
        apellido: 'Incorrecto',
      });

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty(
      'message',
      'El usuario debe ser de tipo POSTULANTE',
    );

    await prisma.usuario.delete({
      where: {
        id: wrongUserId,
      },
    });
  });

  it('POST /postulantes falla si el usuario ya tiene postulante asociado', async () => {
    const response = await request(app)
      .post('/postulantes')
      .set('Cookie', admin.cookie)
      .send({
        usuarioId: createdUserId,
        nombre: 'Otro',
        apellido: 'Postulante',
      });

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty(
      'message',
      'El usuario ya tiene un postulante asociado',
    );
  });

  it('PATCH /postulantes/:id actualiza un postulante', async () => {
    const response = await request(app)
      .patch(`/postulantes/${createdApplicantId}`)
      .set('Cookie', admin.cookie)
      .send({
        nombre: 'Test Actualizado',
        apellido: 'Applicant',
        telefono: '098999888',
      });

    expect(response.status).toBe(200);
    expect(response.body.nombre).toBe('Test Actualizado');
    expect(response.body.telefono).toBe('098999888');
  });

  it('PATCH /postulantes/:id devuelve error si no existe', async () => {
    const response = await request(app)
      .patch('/postulantes/999999')
      .set('Cookie', admin.cookie)
      .send({
        nombre: 'No existe',
      });

    expect(response.status).toBe(404);
    expect(response.body).toHaveProperty('message');
  });

  it('PATCH /postulantes/:id valida los largos sin errores internos', async () => {
    const response = await request(app)
      .patch(`/postulantes/${createdApplicantId}`)
      .set('Cookie', admin.cookie)
      .send({ nombre: 'x'.repeat(101) });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe(
      'El nombre no puede superar los 100 caracteres',
    );
  });

  it('POST /postulantes rechaza un body vacío sin errores internos', async () => {
    const response = await request(app)
      .post('/postulantes')
      .set('Cookie', admin.cookie);

    // Sin body, `app.ts` deja `req.body` en `{}`: es el mismo caso que mandar
    // un objeto vacío, y por eso responde que faltan los datos.
    expect(response.status).toBe(400);
    expect(response.body.message).toBe('Faltan datos obligatorios');
  });

  it('PATCH /postulantes/:id devuelve 400 si el ID es inválido', async () => {
    const response = await request(app)
      .patch('/postulantes/abc')
      .set('Cookie', admin.cookie)
      .send({
        nombre: 'Inválido',
      });

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty('message', 'ID inválido');
  });

  it('DELETE /postulantes/:id elimina un postulante', async () => {
    const response = await request(app)
      .delete(`/postulantes/${createdApplicantId}`)
      .set('Cookie', admin.cookie);

    expect(response.status).toBe(204);

    const deletedApplicant = await prisma.postulante.findUnique({
      where: {
        id: createdApplicantId,
      },
    });

    expect(deletedApplicant).toBeNull();

    createdApplicantId = 0;
  });

  it('DELETE /postulantes/:id devuelve 404 si no existe', async () => {
    const response = await request(app)
      .delete('/postulantes/999999')
      .set('Cookie', admin.cookie);

    expect(response.status).toBe(404);
    expect(response.body).toHaveProperty('message');
  });

  it('DELETE /postulantes/:id devuelve 400 si el ID es inválido', async () => {
    const response = await request(app)
      .delete('/postulantes/abc')
      .set('Cookie', admin.cookie);

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty('message', 'ID inválido');
  });

  describe('permisos', () => {
    let own: Awaited<ReturnType<typeof createApplicant>>;
    let other: Awaited<ReturnType<typeof createApplicant>>;
    let socio: Awaited<ReturnType<typeof createMember>>;

    beforeAll(async () => {
      own = await createApplicant();
      other = await createApplicant();
      socio = await createMember('DIRECTIVO');
    });

    afterAll(async () => {
      await deleteUsers([own.userId, other.userId, socio.userId]);
    });

    it('GET /postulantes devuelve 401 sin sesión', async () => {
      const response = await request(app).get('/postulantes');

      expect(response.status).toBe(401);
    });

    it('un postulante ve y edita su propio perfil', async () => {
      const detail = await request(app)
        .get(`/postulantes/${own.postulanteId}`)
        .set('Cookie', own.cookie);

      const update = await request(app)
        .patch(`/postulantes/${own.postulanteId}`)
        .set('Cookie', own.cookie)
        .send({ telefono: '099000111' });

      expect(detail.status).toBe(200);
      expect(update.status).toBe(200);
      expect(update.body.telefono).toBe('099000111');
    });

    it('un postulante no ve ni edita el perfil de otro', async () => {
      const detail = await request(app)
        .get(`/postulantes/${other.postulanteId}`)
        .set('Cookie', own.cookie);

      const update = await request(app)
        .patch(`/postulantes/${other.postulanteId}`)
        .set('Cookie', own.cookie)
        .send({ nombre: 'Cambiado' });

      expect(detail.status).toBe(404);
      expect(update.status).toBe(404);
    });

    it('un postulante no lista postulantes ni se da de alta o baja', async () => {
      const list = await request(app)
        .get('/postulantes')
        .set('Cookie', own.cookie);

      const remove = await request(app)
        .delete(`/postulantes/${own.postulanteId}`)
        .set('Cookie', own.cookie);

      expect(list.status).toBe(403);
      expect(remove.status).toBe(403);
    });

    it('PATCH /postulantes/:id no permite cambiar el usuario asociado', async () => {
      const response = await request(app)
        .patch(`/postulantes/${own.postulanteId}`)
        .set('Cookie', own.cookie)
        .send({ usuarioId: other.userId });

      expect(response.status).toBe(200);

      const applicant = await prisma.postulante.findUnique({
        where: { id: own.postulanteId },
      });

      expect(applicant!.usuarioId).toBe(own.userId);
    });

    it('un socio no accede al padrón de postulantes', async () => {
      const list = await request(app)
        .get('/postulantes')
        .set('Cookie', socio.cookie);

      const detail = await request(app)
        .get(`/postulantes/${own.postulanteId}`)
        .set('Cookie', socio.cookie);

      expect(list.status).toBe(403);
      expect(detail.status).toBe(403);
    });
  });

  // Los permisos por rol (solo administración y directivos) los prueba la
  // matriz de autorización. Esto prueba qué devuelve a quien sí puede entrar.
  describe('buscador de candidatos', () => {
    const suffix = uniqueSuffix();
    let directivo: Awaited<ReturnType<typeof createMember>>;
    let candidato: Awaited<ReturnType<typeof createApplicant>>;
    let otro: Awaited<ReturnType<typeof createApplicant>>;
    let inactivo: Awaited<ReturnType<typeof createApplicant>>;
    let cvDeOtro = 0;
    let cvPropio = 0;

    beforeAll(async () => {
      [directivo, candidato, otro, inactivo] = await Promise.all([
        createMember('DIRECTIVO'),
        createApplicant(),
        createApplicant(),
        createApplicant(),
      ]);

      // Un apellido propio de este archivo: los demás corren en paralelo y
      // también crean postulantes.
      await prisma.postulante.update({
        where: { id: candidato.postulanteId },
        data: { apellido: `Candidato ${suffix}` },
      });
      await prisma.postulante.update({
        where: { id: inactivo.postulanteId },
        data: { apellido: `Inactivo ${suffix}` },
      });
      await prisma.usuario.update({
        where: { id: inactivo.userId },
        data: { activo: false },
      });

      const [propio, ajeno] = await Promise.all([
        prisma.cv.findFirstOrThrow({
          where: { postulanteId: candidato.postulanteId },
        }),
        prisma.cv.findFirstOrThrow({
          where: { postulanteId: otro.postulanteId },
        }),
      ]);
      await prisma.cv.update({
        where: { id: propio.id },
        data: { archivoUrl: `cvs/postulante-${candidato.postulanteId}/cv.pdf` },
      });
      cvPropio = propio.id;
      cvDeOtro = ajeno.id;
    });

    afterAll(async () => {
      await deleteUsers([
        directivo.userId,
        candidato.userId,
        otro.userId,
        inactivo.userId,
      ]);
    });

    function search(query: string) {
      return request(app)
        .get(`/postulantes/candidatos?${query}`)
        .set('Cookie', directivo.cookie);
    }

    it('encuentra por apellido', async () => {
      const response = await search(`search=${suffix}`);

      expect(response.status).toBe(200);
      expect(response.body.total).toBe(1);
      expect(response.body.items[0].id).toBe(candidato.postulanteId);
    });

    it('no muestra a un postulante con la cuenta desactivada', async () => {
      const list = await search(
        `search=${encodeURIComponent(`Inactivo ${suffix}`)}`,
      );
      const detail = await request(app)
        .get(`/postulantes/candidatos/${inactivo.postulanteId}`)
        .set('Cookie', directivo.cookie);

      expect(list.body.total).toBe(0);
      expect(detail.status).toBe(404);
    });

    it.each([
      ['%', `%${suffix}`],
      ['_', `Candidat_ ${suffix}`],
    ])(
      'un %s en la búsqueda se compara literal, no como comodín',
      async (_, texto) => {
        // Sin escapar, `%` y `_` son comodines de LIKE y estas dos búsquedas
        // encontraban al candidato.
        const response = await search(`search=${encodeURIComponent(texto)}`);

        expect(response.status).toBe(200);
        expect(response.body.total).toBe(0);
      },
    );

    it.each(['limit=51', 'limit=0', 'page=0', 'conEstudios=si'])(
      'rechaza parámetros fuera de rango: %s',
      async (query) => {
        const response = await search(query);

        expect(response.status).toBe(400);
      },
    );

    it('entrega el PDF del candidato con un enlace que vence', async () => {
      const response = await request(app)
        .get(
          `/postulantes/candidatos/${candidato.postulanteId}/cvs/${cvPropio}/archivo`,
        )
        .set('Cookie', directivo.cookie);

      expect(response.status).toBe(200);
      expect(response.body.url).toMatch(/\?expira=60$/);
    });

    it('no entrega el PDF de otro postulante cambiando el id del CV', async () => {
      const response = await request(app)
        .get(
          `/postulantes/candidatos/${candidato.postulanteId}/cvs/${cvDeOtro}/archivo`,
        )
        .set('Cookie', directivo.cookie);

      expect(response.status).toBe(404);
    });
  });
});
