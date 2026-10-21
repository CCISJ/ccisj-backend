import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

import app from '../src/app';
import { prisma } from '../src/config/prisma';
import { createApplicant, createMember, deleteUsers } from './session';
import { storageFalso } from './storage-falso';

// Supabase Storage se reemplaza por uno en memoria (ver storage-falso.ts).
vi.mock('../src/config/supabase', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('../src/config/supabase')>();
  const { supabaseFalso } = await import('./storage-falso.js');

  return { ...original, getSupabase: () => supabaseFalso };
});

const storage = storageFalso;

const PDF = Buffer.from('%PDF-1.7\nCV de prueba');
const NOT_PDF = Buffer.from('esto no es un pdf');

const validCv = {
  nombre: 'Ana',
  apellido: 'Pérez',
  telefono: '099111222',
  direccion: '18 de Julio 456, San José',
  fechaNacimiento: '1998-04-12',
  otros: 'Libreta de conducir',
  estudios: [
    {
      tipo: 'CURRICULAR',
      institucion: 'UTEC',
      titulo: 'Tecnólogo en Informática',
      fechaInicio: '2022-03',
      enCurso: true,
      fechaFin: '2025-12',
    },
    {
      tipo: 'NO_CURRICULAR',
      institucion: 'INEFOP',
      titulo: 'Atención al cliente',
      fechaInicio: '2021-05',
      fechaFin: '2021-08',
    },
  ],
  experiencias: [
    {
      empresa: 'Ferretería Central',
      cargo: 'Vendedor',
      fechaInicio: '2023-01',
      fechaFin: '2024-06',
      tareas: 'Atención en mostrador',
    },
  ],
  referencias: [
    {
      tipo: 'LABORAL',
      nombre: 'María Gómez',
      relacion: 'Encargada',
      telefono: '099333444',
    },
    { tipo: 'PERSONAL', nombre: 'Luis Díaz', email: 'LUIS@ejemplo.com' },
  ],
};

describe('Mi CV', () => {
  const createdUserIds: number[] = [];

  afterAll(async () => {
    await deleteUsers(createdUserIds);
  });

  beforeEach(() => {
    storage.reset();
  });

  async function applicant() {
    const created = await createApplicant({ withCv: false });
    createdUserIds.push(created.userId);

    return created;
  }

  function uploadFiles(cookie: string[], files: Buffer[]) {
    let req = request(app).post('/postulantes/me/cv/archivos').set('Cookie', cookie);

    files.forEach((file, index) => {
      req = req.attach('archivos', file, {
        filename: `cv-${index + 1}.pdf`,
        contentType: 'application/pdf',
      });
    });

    return req;
  }

  it('guarda y devuelve el CV completo, en orden', async () => {
    const { cookie } = await applicant();

    const saved = await request(app)
      .put('/postulantes/me/cv')
      .set('Cookie', cookie)
      .send(validCv);

    expect(saved.status).toBe(200);

    const response = await request(app)
      .get('/postulantes/me/cv')
      .set('Cookie', cookie);

    expect(response.status).toBe(200);
    expect(response.body.direccion).toBe('18 de Julio 456, San José');
    expect(response.body.fechaNacimiento).toMatch(/^1998-04-12/);
    expect(
      response.body.estudios.map((e: { titulo: string }) => e.titulo),
    ).toEqual(['Tecnólogo en Informática', 'Atención al cliente']);
    // En curso: la fecha de fin se descarta.
    expect(response.body.estudios[0].fechaFin).toBeNull();
    expect(response.body.experiencias).toHaveLength(1);
    expect(response.body.referencias[1].email).toBe('luis@ejemplo.com');
  });

  it('las listas se reemplazan completas al volver a guardar', async () => {
    const { cookie, postulanteId } = await applicant();

    await request(app).put('/postulantes/me/cv').set('Cookie', cookie).send(validCv);

    const response = await request(app)
      .put('/postulantes/me/cv')
      .set('Cookie', cookie)
      .send({ ...validCv, estudios: [], referencias: [] });

    expect(response.status).toBe(200);
    expect(response.body.estudios).toEqual([]);
    expect(await prisma.estudio.count({ where: { postulanteId } })).toBe(0);
    expect(await prisma.referencia.count({ where: { postulanteId } })).toBe(0);
  });

  it.each([
    ['sin nombre', { nombre: '' }],
    ['fecha de nacimiento inválida', { fechaNacimiento: '1998-02-30' }],
    ['fecha de nacimiento futura', { fechaNacimiento: '2999-01-01' }],
    ['tipo de estudio inválido', { estudios: [{ tipo: 'X', institucion: 'A', titulo: 'B' }] }],
    ['estudio sin institución', { estudios: [{ tipo: 'CURRICULAR', titulo: 'B' }] }],
    [
      'fin antes del inicio',
      {
        experiencias: [
          { empresa: 'A', cargo: 'B', fechaInicio: '2024-05', fechaFin: '2023-01' },
        ],
      },
    ],
    ['referencia sin contacto', { referencias: [{ tipo: 'PERSONAL', nombre: 'A' }] }],
    ['lista que no es lista', { estudios: 'UTEC' }],
  ])('rechaza con 400: %s', async (_caso, cambio) => {
    const { cookie } = await applicant();

    const response = await request(app)
      .put('/postulantes/me/cv')
      .set('Cookie', cookie)
      .send({ ...validCv, ...cambio });

    expect(response.status).toBe(400);
  });

  it('sube varios PDF a la vez y los lista', async () => {
    const { cookie, postulanteId } = await applicant();

    const response = await uploadFiles(cookie, [PDF, PDF, PDF]);

    expect(response.status).toBe(201);
    expect(response.body).toHaveLength(3);
    expect(response.body[0].nombreArchivo).toBe('cv-1.pdf');
    expect(response.body[0]).not.toHaveProperty('archivoUrl');
    expect(storage.files.size).toBe(3);

    for (const path of storage.files.keys()) {
      expect(path).toMatch(new RegExp(`^cvs/postulante-${postulanteId}/`));
    }

    const cv = await request(app).get('/postulantes/me/cv').set('Cookie', cookie);

    expect(cv.body.cvs).toHaveLength(3);
  });

  it('si un archivo no es PDF no sube ninguno', async () => {
    const { cookie } = await applicant();

    const response = await uploadFiles(cookie, [PDF, NOT_PDF]);

    expect(response.status).toBe(400);
    expect(storage.files.size).toBe(0);
  });

  it('responde 400 si no se manda ningún archivo', async () => {
    const { cookie } = await applicant();

    const response = await request(app)
      .post('/postulantes/me/cv/archivos')
      .set('Cookie', cookie);

    expect(response.status).toBe(400);
  });

  it('da un enlace firmado y borra un PDF propio', async () => {
    const { cookie } = await applicant();

    const [file] = (await uploadFiles(cookie, [PDF])).body;

    const link = await request(app)
      .get(`/postulantes/me/cv/archivos/${file.id}`)
      .set('Cookie', cookie);

    expect(link.status).toBe(200);
    expect(link.body.url).toMatch(/^https:\/\/storage\.test\/cvs\//);

    const deleted = await request(app)
      .delete(`/postulantes/me/cv/archivos/${file.id}`)
      .set('Cookie', cookie);

    expect(deleted.status).toBe(204);
    expect(storage.files.size).toBe(0);
  });

  it('no deja ver ni borrar el PDF de otro postulante', async () => {
    const owner = await applicant();
    const other = await applicant();

    const [file] = (await uploadFiles(owner.cookie, [PDF])).body;

    const link = await request(app)
      .get(`/postulantes/me/cv/archivos/${file.id}`)
      .set('Cookie', other.cookie);
    const deleted = await request(app)
      .delete(`/postulantes/me/cv/archivos/${file.id}`)
      .set('Cookie', other.cookie);

    expect(link.status).toBe(404);
    expect(deleted.status).toBe(404);
    expect(storage.files.size).toBe(1);
  });

  it('con el CV del formulario ya se puede postular', async () => {
    const { cookie } = await applicant();
    const member = await createMember();
    createdUserIds.push(member.userId);

    const offer = await prisma.oferta.create({
      data: {
        socioId: member.socioId,
        creadaPor: member.userId,
        titulo: 'Oferta para el test de CV',
        descripcion: 'Descripción',
        estado: 'ACTIVA',
      },
    });

    await request(app).put('/postulantes/me/cv').set('Cookie', cookie).send(validCv);

    const response = await request(app)
      .post('/postulaciones')
      .set('Cookie', cookie)
      .send({ ofertaId: offer.id });

    expect(response.status).toBe(201);

    await prisma.oferta.delete({ where: { id: offer.id } });
  });

  it('PATCH /postulantes/me/perfil guarda datos y rubros sin tocar el CV', async () => {
    const { cookie, postulanteId } = await applicant();
    const category = await prisma.categoria.create({
      data: { nombre: `Rubro perfil ${postulanteId}-${Date.now()}` },
    });

    await request(app).put('/postulantes/me/cv').set('Cookie', cookie).send(validCv);

    const response = await request(app)
      .patch('/postulantes/me/perfil')
      .set('Cookie', cookie)
      .send({
        nombre: 'Ana María',
        apellido: 'Pérez',
        telefono: '099000111',
        direccion: 'Otra dirección 123',
        fechaNacimiento: '1998-04-12',
        categoriaIds: [category.id],
      });

    expect(response.status).toBe(200);
    expect(response.body.nombre).toBe('Ana María');
    expect(response.body.categorias).toEqual([
      { categoria: { id: category.id, nombre: category.nombre } },
    ]);
    // El CV sigue igual.
    expect(response.body.estudios).toHaveLength(2);

    const sinTelefono = await request(app)
      .patch('/postulantes/me/perfil')
      .set('Cookie', cookie)
      .send({ nombre: 'Ana', apellido: 'Pérez', telefono: '' });

    expect(sinTelefono.status).toBe(400);

    await prisma.categoria.delete({ where: { id: category.id } });
  });
});
