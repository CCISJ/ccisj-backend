import { HttpError } from '@/utils/http-error';

import {
  deleteGestionFilesFromStorage,
  detectFileType,
  getGestionFileSignedUrl,
  uploadGestionFileToStorage,
} from './gestion-storage.service';
import * as gestionRepository from './gestion.repository';

export const TITULO_MAX = 200;
export const DESCRIPCION_MAX = 20_000;
export const CATEGORIA_MAX = 80;
export const SEARCH_MAX = 100;

/** Cuántos archivos puede tener una gestión en total. */
export const ARCHIVOS_MAX = 20;

type GestionData = {
  titulo: string;
  descripcion: string;
  categoria: string;
};

function assertObject(body: unknown): asserts body is Record<string, unknown> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new HttpError(400, 'Datos inválidos');
  }
}

/** Un texto obligatorio, sin espacios de más en los bordes. */
function requiredText(
  value: unknown,
  label: string,
  max: number,
  missing: string,
) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new HttpError(400, missing);
  }

  const text = value.trim();

  if (text.length > max) {
    throw new HttpError(400, `${label} puede tener hasta ${max} caracteres`);
  }

  return text;
}

/**
 * La categoría es libre, pero si ya hay una escrita igual salvo mayúsculas
 * ("trámites" y "Trámites"), se usa la que existe: si no, el filtro mostraría
 * las dos como si fueran distintas.
 */
async function normalizeCategory(value: unknown) {
  const categoria = requiredText(
    value,
    'La categoría',
    CATEGORIA_MAX,
    'Elegí o escribí una categoría',
  ).replace(/\s+/g, ' ');

  return (await gestionRepository.findCategoryLike(categoria)) ?? categoria;
}

async function parseData(body: unknown, partial: boolean) {
  assertObject(body);

  const data: Partial<GestionData> = {};

  if (!partial || body.titulo !== undefined) {
    data.titulo = requiredText(
      body.titulo,
      'El título',
      TITULO_MAX,
      'Escribí un título',
    );
  }

  if (!partial || body.descripcion !== undefined) {
    data.descripcion = requiredText(
      body.descripcion,
      'La descripción',
      DESCRIPCION_MAX,
      'Escribí una descripción',
    );
  }

  if (!partial || body.categoria !== undefined) {
    data.categoria = await normalizeCategory(body.categoria);
  }

  return data;
}

function optionalFilter(value: unknown, label: string, max: number) {
  if (value === undefined || value === '') return undefined;

  if (typeof value !== 'string') {
    throw new HttpError(400, `El parámetro ${label} vino repetido`);
  }

  const text = value.trim();

  if (text.length > max) {
    throw new HttpError(400, `El parámetro ${label} es demasiado largo`);
  }

  return text || undefined;
}

export async function getAll(query: Record<string, unknown>) {
  const search = optionalFilter(query.search, 'search', SEARCH_MAX);
  const categoria = optionalFilter(query.categoria, 'categoria', CATEGORIA_MAX);

  const gestiones = await gestionRepository.findAll({ search, categoria });

  return gestiones.map(({ _count, ...gestion }) => ({
    ...gestion,
    cantidadArchivos: _count.archivos,
  }));
}

export function getCategories() {
  return gestionRepository.findCategories();
}

export async function getById(id: number) {
  const gestion = await gestionRepository.findById(id);

  if (!gestion) {
    throw new HttpError(404, 'Gestión no encontrada');
  }

  return gestion;
}

export async function create(body: unknown, creadoPorId: number) {
  const data = (await parseData(body, false)) as GestionData;

  const { id } = await gestionRepository.create({ ...data, creadoPorId });

  return getById(id);
}

export async function update(id: number, body: unknown) {
  const data = await parseData(body, true);

  if (!(await gestionRepository.exists(id))) {
    throw new HttpError(404, 'Gestión no encontrada');
  }

  if (Object.keys(data).length === 0) {
    throw new HttpError(400, 'No hay nada para cambiar');
  }

  await gestionRepository.update(id, data);

  return getById(id);
}

/**
 * Borra la gestión y sus archivos. Primero los archivos: si Storage falla,
 * la gestión queda entera y se puede reintentar, en vez de quedar archivos
 * huérfanos que nadie puede ver ni borrar.
 */
export async function remove(id: number) {
  if (!(await gestionRepository.exists(id))) {
    throw new HttpError(404, 'Gestión no encontrada');
  }

  const files = await gestionRepository.findFilePaths(id);

  await deleteGestionFilesFromStorage(files.map((file) => file.ruta));
  await gestionRepository.remove(id);
}

/**
 * El nombre con el que se subió, sin rutas ni caracteres de control: se
 * muestra en pantalla y se usa como nombre de la descarga.
 */
function cleanFileName(name: string) {
  const base = name.split(/[\\/]/).pop() ?? '';
  const clean = base.replace(/[\p{Cc}]/gu, '').trim();

  return (clean || 'archivo').slice(0, 255);
}

export async function addFiles(id: number, files: Express.Multer.File[]) {
  if (files.length === 0) {
    throw new HttpError(400, 'Elegí al menos un archivo');
  }

  if (!(await gestionRepository.exists(id))) {
    throw new HttpError(404, 'Gestión no encontrada');
  }

  const current = await gestionRepository.countFiles(id);

  if (current + files.length > ARCHIVOS_MAX) {
    throw new HttpError(
      400,
      `Una gestión puede tener hasta ${ARCHIVOS_MAX} archivos (ya tiene ${current})`,
    );
  }

  // Todos se validan antes de subir ninguno: o entran todos o ninguno.
  const detected = files.map((file) => {
    const type = detectFileType(file.buffer, file.mimetype);

    if (!type) {
      throw new HttpError(
        400,
        `"${cleanFileName(file.originalname)}" no es un PDF, JPG, PNG, Word o Excel válido`,
      );
    }

    return type;
  });

  const uploaded: string[] = [];

  try {
    for (const [index, file] of files.entries()) {
      uploaded.push(
        await uploadGestionFileToStorage(id, file.buffer, detected[index]),
      );
    }

    const created = await gestionRepository.createFiles(
      id,
      files.map((file, index) => ({
        ruta: uploaded[index],
        nombre: cleanFileName(file.originalname),
        tipo: detected[index].contentType,
        tamano: file.size,
      })),
    );

    await gestionRepository.touch(id);

    return created;
  } catch (error) {
    // Lo que alcanzó a subirse no queda suelto en Storage.
    await deleteGestionFilesFromStorage(uploaded).catch(() => undefined);
    throw error;
  }
}

export async function getFileUrl(id: number, archivoId: number) {
  const file = await gestionRepository.findFile(id, archivoId);

  if (!file) {
    throw new HttpError(404, 'Archivo no encontrado');
  }

  return {
    url: await getGestionFileSignedUrl(file.ruta, file.nombre, file.tipo),
  };
}

export async function removeFile(id: number, archivoId: number) {
  const file = await gestionRepository.findFile(id, archivoId);

  if (!file) {
    throw new HttpError(404, 'Archivo no encontrado');
  }

  await deleteGestionFilesFromStorage([file.ruta]);
  await gestionRepository.removeFile(file.id);
  await gestionRepository.touch(id);
}
