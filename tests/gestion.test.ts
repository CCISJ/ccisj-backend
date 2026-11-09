/**
 * Gestoría: informes y trámites que la administración deja asentados para los
 * socios directivos. La administración escribe; los directivos consultan.
 *
 * Quién entra a cada ruta lo prueba también la matriz de autorización. Acá se
 * prueba qué hace cada una con datos reales, y los accesos cruzados (un
 * archivo pedido con la gestión equivocada).
 */
import request from 'supertest';
import {
  afterAll,
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
  createAdmin,
  createMember,
  deleteUsers,
  uniqueSuffix,
} from './session';
import { storageFalso } from './storage-falso';

// Supabase Storage se reemplaza por uno en memoria (ver storage-falso.ts).
vi.mock('../src/config/supabase', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('../src/config/supabase')>();
  const { supabaseFalso } = await import('./storage-falso.js');

  return { ...original, getSupabase: () => supabaseFalso };
});

const WORD =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const PDF = Buffer.from('%PDF-1.7\nInforme de prueba');
// Word y Excel son ZIP por dentro: empiezan con "PK\x03\x04".
const DOCX = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x06, 0x00]);
const TEXTO = Buffer.from('esto no es un pdf');

let admin: Awaited<ReturnType<typeof createAdmin>>;
let directivo: Awaited<ReturnType<typeof createMember>>;
let comun: Awaited<ReturnType<typeof createMember>>;

// Una categoría propia de este archivo: otros pueden correr a la vez.
const suffix = uniqueSuffix();
const CATEGORIA = `Trámites ${suffix}`;

beforeAll(async () => {
  [admin, directivo, comun] = await Promise.all([
    createAdmin(),
    createMember('DIRECTIVO'),
    createMember('COMUN'),
  ]);
});

beforeEach(() => {
  storageFalso.reset();
});

afterAll(async () => {
  // `deleteUsers` borra las gestiones del admin, y con ellas sus archivos.
  await deleteUsers([admin.userId, directivo.userId, comun.userId]);
  await prisma.$disconnect();
});

function crear(body: Record<string, unknown>) {
  return request(app).post('/gestiones').set('Cookie', admin.cookie).send(body);
}

async function crearGestion(extra: Record<string, unknown> = {}) {
  const response = await crear({
    titulo: 'Habilitación municipal',
    descripcion: 'Pasos y documentos para renovar la habilitación.',
    categoria: CATEGORIA,
    ...extra,
  });

  expect(response.status).toBe(201);

  return response.body as { id: number; categoria: string };
}

function subir(
  id: number,
  archivos: { buffer: Buffer; filename: string; contentType: string }[],
  cookie = admin.cookie,
) {
  let req = request(app)
    .post(`/gestiones/${id}/archivos`)
    .set('Cookie', cookie);

  for (const archivo of archivos) {
    req = req.attach('archivos', archivo.buffer, {
      filename: archivo.filename,
      contentType: archivo.contentType,
    });
  }

  return req;
}

describe('Gestoría: crear, editar y borrar', () => {
  it('la administración crea una gestión, sin espacios de más', async () => {
    const response = await crear({
      titulo: '  Certificado de origen  ',
      descripcion: 'Cómo pedirlo ante la Cámara.',
      categoria: `  ${CATEGORIA}  `,
    });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      titulo: 'Certificado de origen',
      descripcion: 'Cómo pedirlo ante la Cámara.',
      categoria: CATEGORIA,
      archivos: [],
    });
  });

  it('título, descripción y categoría son obligatorios y tienen largo máximo', async () => {
    const casos: [Record<string, unknown>, string][] = [
      [{ descripcion: 'x', categoria: 'x' }, 'Escribí un título'],
      [
        { titulo: '   ', descripcion: 'x', categoria: 'x' },
        'Escribí un título',
      ],
      [{ titulo: 'x', categoria: 'x' }, 'Escribí una descripción'],
      [{ titulo: 'x', descripcion: 'x' }, 'Elegí o escribí una categoría'],
      [
        { titulo: 'x'.repeat(201), descripcion: 'x', categoria: 'x' },
        'El título puede tener hasta 200 caracteres',
      ],
      [
        { titulo: 'x', descripcion: 'x', categoria: 'x'.repeat(81) },
        'La categoría puede tener hasta 80 caracteres',
      ],
      [{ titulo: 5, descripcion: 'x', categoria: 'x' }, 'Escribí un título'],
    ];

    for (const [body, message] of casos) {
      const response = await crear(body);

      // El mensaje primero: si falla, dice qué caso fue.
      expect(response.body.message).toBe(message);
      expect(response.status).toBe(400);
    }
  });

  it('una categoría escrita igual salvo mayúsculas usa la que ya existe', async () => {
    await crearGestion();

    const otra = await crearGestion({
      categoria: CATEGORIA.toUpperCase().replace(' ', '   '),
    });

    expect(otra.categoria).toBe(CATEGORIA);
  });

  it('edita solo lo que se manda', async () => {
    const gestion = await crearGestion();

    const response = await request(app)
      .patch(`/gestiones/${gestion.id}`)
      .set('Cookie', admin.cookie)
      .send({ titulo: 'Habilitación 2027', creadoPorId: directivo.userId });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      titulo: 'Habilitación 2027',
      descripcion: 'Pasos y documentos para renovar la habilitación.',
      categoria: CATEGORIA,
    });

    // El autor no se cambia desde el body.
    const stored = await prisma.gestion.findUnique({
      where: { id: gestion.id },
    });

    expect(stored?.creadoPorId).toBe(admin.userId);
  });

  it('editar sin cambios, o una gestión que no existe, se explica', async () => {
    const gestion = await crearGestion();

    const vacio = await request(app)
      .patch(`/gestiones/${gestion.id}`)
      .set('Cookie', admin.cookie)
      .send({});
    const inexistente = await request(app)
      .patch('/gestiones/999999999')
      .set('Cookie', admin.cookie)
      .send({ titulo: 'x' });

    expect(vacio.status).toBe(400);
    expect(vacio.body.message).toBe('No hay nada para cambiar');
    expect(inexistente.status).toBe(404);
  });

  it('borrar una gestión borra también sus archivos de Storage', async () => {
    const gestion = await crearGestion();

    const subida = await subir(gestion.id, [
      { buffer: PDF, filename: 'a.pdf', contentType: 'application/pdf' },
    ]);
    expect(subida.status).toBe(201);
    expect(storageFalso.files.size).toBe(1);

    const response = await request(app)
      .delete(`/gestiones/${gestion.id}`)
      .set('Cookie', admin.cookie);

    expect(response.status).toBe(200);
    expect(storageFalso.files.size).toBe(0);
    expect(
      await prisma.archivoGestion.count({ where: { gestionId: gestion.id } }),
    ).toBe(0);

    const despues = await request(app)
      .get(`/gestiones/${gestion.id}`)
      .set('Cookie', admin.cookie);

    expect(despues.status).toBe(404);
  });
});

describe('Gestoría: lo que ve un directivo', () => {
  it('lista las gestiones, con cuántos archivos tiene cada una', async () => {
    const gestion = await crearGestion({ titulo: `Informe ${suffix}` });
    await subir(gestion.id, [
      { buffer: PDF, filename: 'a.pdf', contentType: 'application/pdf' },
    ]);

    const response = await request(app)
      .get('/gestiones')
      .set('Cookie', directivo.cookie);

    expect(response.status).toBe(200);

    const item = response.body.find((g: { id: number }) => g.id === gestion.id);

    expect(item).toMatchObject({
      titulo: `Informe ${suffix}`,
      categoria: CATEGORIA,
      cantidadArchivos: 1,
    });
  });

  it('busca en título, descripción y categoría, y filtra por categoría', async () => {
    const buscada = await crearGestion({
      titulo: `Exportación ${suffix}`,
      categoria: `Comercio exterior ${suffix}`,
    });
    await crearGestion({ titulo: `Otra ${suffix}` });

    const porTexto = await request(app)
      .get(`/gestiones?search=${encodeURIComponent(`exportación ${suffix}`)}`)
      .set('Cookie', directivo.cookie);
    const porCategoria = await request(app)
      .get(
        `/gestiones?categoria=${encodeURIComponent(`comercio EXTERIOR ${suffix}`)}`,
      )
      .set('Cookie', directivo.cookie);

    expect(porTexto.body.map((g: { id: number }) => g.id)).toEqual([
      buscada.id,
    ]);
    expect(porCategoria.body.map((g: { id: number }) => g.id)).toEqual([
      buscada.id,
    ]);
  });

  it('un % en la búsqueda se compara literal, no como comodín', async () => {
    const response = await request(app)
      .get(`/gestiones?search=${encodeURIComponent(`%${suffix}`)}`)
      .set('Cookie', directivo.cookie);

    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
  });

  it('un parámetro repetido o demasiado largo es un 400, no una búsqueda rara', async () => {
    const repetido = await request(app)
      .get('/gestiones?search=a&search=b')
      .set('Cookie', directivo.cookie);
    const largo = await request(app)
      .get(`/gestiones?search=${'x'.repeat(101)}`)
      .set('Cookie', directivo.cookie);

    expect(repetido.status).toBe(400);
    expect(largo.status).toBe(400);
  });

  it('las categorías en uso, con cuántas gestiones tiene cada una', async () => {
    const categoria = `Categoría única ${suffix}`;
    await crearGestion({ categoria });
    await crearGestion({ categoria });

    const response = await request(app)
      .get('/gestiones/categorias')
      .set('Cookie', directivo.cookie);

    expect(response.status).toBe(200);
    expect(response.body).toContainEqual({ nombre: categoria, cantidad: 2 });
  });

  it('un socio común no entra, y un directivo no puede escribir', async () => {
    const gestion = await crearGestion();

    const lista = await request(app)
      .get('/gestiones')
      .set('Cookie', comun.cookie);
    const crearComoDirectivo = await request(app)
      .post('/gestiones')
      .set('Cookie', directivo.cookie)
      .send({ titulo: 'x', descripcion: 'x', categoria: 'x' });
    const subirComoDirectivo = await subir(
      gestion.id,
      [{ buffer: PDF, filename: 'a.pdf', contentType: 'application/pdf' }],
      directivo.cookie,
    );

    expect(lista.status).toBe(403);
    expect(crearComoDirectivo.status).toBe(403);
    expect(subirComoDirectivo.status).toBe(403);
    expect(storageFalso.files.size).toBe(0);
  });
});

describe('Gestoría: archivos', () => {
  it('sube PDF y Word, y la ficha no muestra la ruta en Storage', async () => {
    const gestion = await crearGestion();

    const response = await subir(gestion.id, [
      { buffer: PDF, filename: 'informe.pdf', contentType: 'application/pdf' },
      {
        buffer: DOCX,
        filename: 'C:\\temp\\formulario.docx',
        contentType: WORD,
      },
    ]);

    expect(response.status).toBe(201);
    expect(response.body).toHaveLength(2);

    const ficha = await request(app)
      .get(`/gestiones/${gestion.id}`)
      .set('Cookie', directivo.cookie);

    expect(ficha.body.archivos).toEqual([
      expect.objectContaining({
        nombre: 'informe.pdf',
        tipo: 'application/pdf',
        tamano: PDF.length,
      }),
      // El nombre llega sin la carpeta de la máquina de quien lo subió.
      expect.objectContaining({ nombre: 'formulario.docx', tipo: WORD }),
    ]);
    expect(JSON.stringify(ficha.body)).not.toContain('gestoria/');

    expect([...storageFalso.files.values()].sort()).toEqual(
      ['application/pdf', WORD].sort(),
    );
  });

  it('el tipo se verifica por el contenido: si uno es falso, no se sube ninguno', async () => {
    const gestion = await crearGestion();

    const response = await subir(gestion.id, [
      { buffer: PDF, filename: 'bueno.pdf', contentType: 'application/pdf' },
      { buffer: TEXTO, filename: 'falso.pdf', contentType: 'application/pdf' },
    ]);

    expect(response.status).toBe(400);
    expect(response.body.message).toBe(
      '"falso.pdf" no es un PDF, JPG, PNG, Word o Excel válido',
    );
    expect(storageFalso.files.size).toBe(0);
    expect(
      await prisma.archivoGestion.count({ where: { gestionId: gestion.id } }),
    ).toBe(0);
  });

  it('un ZIP solo pasa si se declaró como Word o Excel', async () => {
    const gestion = await crearGestion();

    const response = await subir(gestion.id, [
      { buffer: DOCX, filename: 'raro.pdf', contentType: 'application/pdf' },
    ]);

    expect(response.status).toBe(400);
    expect(storageFalso.files.size).toBe(0);
  });

  it('rechaza un tipo no permitido y una subida sin archivos', async () => {
    const gestion = await crearGestion();

    const exe = await subir(gestion.id, [
      {
        buffer: TEXTO,
        filename: 'virus.exe',
        contentType: 'application/x-msdownload',
      },
    ]);
    const vacia = await request(app)
      .post(`/gestiones/${gestion.id}/archivos`)
      .set('Cookie', admin.cookie);

    expect(exe.status).toBe(400);
    expect(vacia.status).toBe(400);
    expect(vacia.body.message).toBe('Elegí al menos un archivo');
  });

  it('una gestión tiene hasta 20 archivos', async () => {
    const gestion = await crearGestion();

    await prisma.archivoGestion.createMany({
      data: Array.from({ length: 20 }, (_, i) => ({
        gestionId: gestion.id,
        ruta: `gestoria/gestion-${gestion.id}/relleno-${i}.pdf`,
        nombre: `relleno-${i}.pdf`,
        tipo: 'application/pdf',
        tamano: 1,
      })),
    });

    const response = await subir(gestion.id, [
      { buffer: PDF, filename: 'uno-mas.pdf', contentType: 'application/pdf' },
    ]);

    expect(response.status).toBe(400);
    expect(response.body.message).toBe(
      'Una gestión puede tener hasta 20 archivos (ya tiene 20)',
    );
  });

  it('si Storage falla, no queda nada a medias', async () => {
    const gestion = await crearGestion();
    storageFalso.failing = true;

    const response = await subir(gestion.id, [
      { buffer: PDF, filename: 'a.pdf', contentType: 'application/pdf' },
    ]);

    expect(response.status).toBe(500);
    expect(JSON.stringify(response.body)).not.toContain('Bucket');
    expect(
      await prisma.archivoGestion.count({ where: { gestionId: gestion.id } }),
    ).toBe(0);
  });

  it('el directivo abre un archivo con un enlace firmado; con otra gestión, 404', async () => {
    const gestion = await crearGestion();
    const otra = await crearGestion();
    const subida = await subir(gestion.id, [
      { buffer: PDF, filename: 'a.pdf', contentType: 'application/pdf' },
    ]);
    const archivoId = subida.body[0].id;

    const propio = await request(app)
      .get(`/gestiones/${gestion.id}/archivos/${archivoId}`)
      .set('Cookie', directivo.cookie);
    const cruzado = await request(app)
      .get(`/gestiones/${otra.id}/archivos/${archivoId}`)
      .set('Cookie', directivo.cookie);
    const borrarCruzado = await request(app)
      .delete(`/gestiones/${otra.id}/archivos/${archivoId}`)
      .set('Cookie', admin.cookie);

    expect(propio.status).toBe(200);
    expect(propio.body.url).toMatch(
      new RegExp(`^https://storage\\.test/gestoria/gestion-${gestion.id}/`),
    );
    expect(cruzado.status).toBe(404);
    expect(borrarCruzado.status).toBe(404);
    expect(storageFalso.files.size).toBe(1);
  });

  it('borrar un archivo lo saca de Storage y de la ficha', async () => {
    const gestion = await crearGestion();
    const subida = await subir(gestion.id, [
      { buffer: PDF, filename: 'a.pdf', contentType: 'application/pdf' },
    ]);

    const response = await request(app)
      .delete(`/gestiones/${gestion.id}/archivos/${subida.body[0].id}`)
      .set('Cookie', admin.cookie);

    expect(response.status).toBe(200);
    expect(storageFalso.files.size).toBe(0);

    const ficha = await request(app)
      .get(`/gestiones/${gestion.id}`)
      .set('Cookie', admin.cookie);

    expect(ficha.body.archivos).toEqual([]);
  });
});
