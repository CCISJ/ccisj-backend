import { EMAIL_MAX, EMAIL_PATTERN, normalizeEmail } from '@/utils/email';
import { HttpError } from '@/utils/http-error';

import { parseCategoryPreferences } from './category-preferences';
import {
  deleteCvsFromStorage,
  getCvSignedUrl,
  isPdf,
  uploadCvToStorage,
} from './cv-storage.service';
import * as cvRepository from './cv.repository';
import type {
  CvInput,
  EducationInput,
  ExperienceInput,
  ReferenceInput,
} from './cv.repository';

/** Cuántos ítems puede tener cada lista del CV. */
export const CV_MAX_ITEMS = 20;

/** Cuántos PDF puede tener cargados un postulante en total. */
export const CV_MAX_FILES = 10;

const TEXT_MAX = 2000;

type Body = Record<string, unknown>;

function assertObject(value: unknown, label: string): asserts value is Body {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new HttpError(400, `${label}: datos inválidos`);
  }
}

/** Texto opcional: vacío o ausente es null. */
function optionalText(value: unknown, label: string, max: number) {
  if (value === undefined || value === null) return null;

  if (typeof value !== 'string') {
    throw new HttpError(400, `${label} no es válido`);
  }

  const trimmed = value.trim();

  if (trimmed.length > max) {
    throw new HttpError(400, `${label} no puede superar los ${max} caracteres`);
  }

  return trimmed || null;
}

function requiredText(value: unknown, label: string, max: number) {
  const text = optionalText(value, label, max);

  if (!text) {
    throw new HttpError(400, `${label} es obligatorio`);
  }

  return text;
}

function optionalBoolean(value: unknown, label: string) {
  if (value === undefined || value === null) return false;

  if (typeof value !== 'boolean') {
    throw new HttpError(400, `${label} no es válido`);
  }

  return value;
}

/**
 * Fecha `AAAA-MM-DD`, o `AAAA-MM` para los períodos de estudio y trabajo (se
 * guarda el día 1). Se arma en UTC para que la zona horaria del servidor no
 * la corra un día.
 */
function optionalDate(
  value: unknown,
  label: string,
  { monthOnly = false } = {},
) {
  if (value === undefined || value === null || value === '') return null;

  const pattern = monthOnly
    ? /^(\d{4})-(\d{2})(?:-(\d{2}))?$/
    : /^(\d{4})-(\d{2})-(\d{2})$/;

  const match = typeof value === 'string' ? pattern.exec(value) : null;

  if (!match) {
    throw new HttpError(400, `${label} no es una fecha válida`);
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = match[3] ? Number(match[3]) : 1;
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day ||
    year < 1900
  ) {
    throw new HttpError(400, `${label} no es una fecha válida`);
  }

  if (date.getTime() > Date.now()) {
    throw new HttpError(400, `${label} no puede ser una fecha futura`);
  }

  return date;
}

function assertPeriod(
  inicio: Date | null,
  fin: Date | null,
  label: string,
): void {
  if (inicio && fin && fin < inicio) {
    throw new HttpError(
      400,
      `${label}: la fecha de fin no puede ser anterior a la de inicio`,
    );
  }
}

function parseList<T>(
  value: unknown,
  label: string,
  parseItem: (item: unknown, label: string) => T,
): T[] {
  if (value === undefined || value === null) return [];

  if (!Array.isArray(value)) {
    throw new HttpError(400, `${label}: datos inválidos`);
  }

  if (value.length > CV_MAX_ITEMS) {
    throw new HttpError(
      400,
      `${label}: se pueden cargar hasta ${CV_MAX_ITEMS}`,
    );
  }

  return value.map((item, index) => parseItem(item, `${label} ${index + 1}`));
}

function parseEducation(item: unknown, label: string): EducationInput {
  assertObject(item, label);

  if (item.tipo !== 'CURRICULAR' && item.tipo !== 'NO_CURRICULAR') {
    throw new HttpError(400, `${label}: el tipo de estudio no es válido`);
  }

  const enCurso = optionalBoolean(item.enCurso, `${label}: en curso`);
  const fechaInicio = optionalDate(item.fechaInicio, `${label}: inicio`, {
    monthOnly: true,
  });
  // Si sigue cursando no hay fecha de fin, aunque el formulario la mande.
  const fechaFin = enCurso
    ? null
    : optionalDate(item.fechaFin, `${label}: fin`, { monthOnly: true });

  assertPeriod(fechaInicio, fechaFin, label);

  return {
    tipo: item.tipo,
    institucion: requiredText(
      item.institucion,
      `${label}: la institución`,
      150,
    ),
    titulo: requiredText(item.titulo, `${label}: el título o curso`, 150),
    fechaInicio,
    fechaFin,
    enCurso,
    descripcion: optionalText(
      item.descripcion,
      `${label}: la descripción`,
      TEXT_MAX,
    ),
  };
}

function parseExperience(item: unknown, label: string): ExperienceInput {
  assertObject(item, label);

  const actual = optionalBoolean(item.actual, `${label}: trabajo actual`);
  const fechaInicio = optionalDate(item.fechaInicio, `${label}: inicio`, {
    monthOnly: true,
  });
  const fechaFin = actual
    ? null
    : optionalDate(item.fechaFin, `${label}: fin`, { monthOnly: true });

  assertPeriod(fechaInicio, fechaFin, label);

  return {
    empresa: requiredText(item.empresa, `${label}: la empresa`, 150),
    cargo: requiredText(item.cargo, `${label}: el cargo`, 150),
    fechaInicio,
    fechaFin,
    actual,
    tareas: optionalText(item.tareas, `${label}: las tareas`, TEXT_MAX),
  };
}

function parseReference(item: unknown, label: string): ReferenceInput {
  assertObject(item, label);

  if (item.tipo !== 'LABORAL' && item.tipo !== 'PERSONAL') {
    throw new HttpError(400, `${label}: el tipo de referencia no es válido`);
  }

  const rawEmail = optionalText(item.email, `${label}: el email`, EMAIL_MAX);
  const email = rawEmail ? normalizeEmail(rawEmail) : null;

  if (email && !EMAIL_PATTERN.test(email)) {
    throw new HttpError(400, `${label}: el email no es válido`);
  }

  const telefono = optionalText(item.telefono, `${label}: el teléfono`, 50);

  if (!telefono && !email) {
    throw new HttpError(
      400,
      `${label}: indicá un teléfono o un email de contacto`,
    );
  }

  return {
    tipo: item.tipo,
    nombre: requiredText(item.nombre, `${label}: el nombre`, 150),
    relacion: optionalText(item.relacion, `${label}: la relación`, 150),
    telefono,
    email,
  };
}

function parseCv(body: unknown): CvInput {
  assertObject(body, 'CV');

  return {
    nombre: requiredText(body.nombre, 'El nombre', 100),
    apellido: requiredText(body.apellido, 'El apellido', 100),
    telefono: optionalText(body.telefono, 'El teléfono', 50),
    direccion: optionalText(body.direccion, 'La dirección', 255),
    fechaNacimiento: optionalDate(
      body.fechaNacimiento,
      'La fecha de nacimiento',
    ),
    otros: optionalText(body.otros, 'Otros datos', TEXT_MAX),
    estudios: parseList(body.estudios, 'Estudio', parseEducation),
    experiencias: parseList(body.experiencias, 'Experiencia', parseExperience),
    referencias: parseList(body.referencias, 'Referencia', parseReference),
  };
}

async function findCvOrFail(postulanteId: number) {
  const cv = await cvRepository.findCv(postulanteId);

  if (!cv) {
    throw new HttpError(404, 'Postulante no encontrado');
  }

  return cv;
}

export function getCv(postulanteId: number) {
  return findCvOrFail(postulanteId);
}

export async function saveCv(postulanteId: number, body: unknown) {
  const data = parseCv(body);

  // `categoriaIds` es opcional: si no viene, se dejan las que tenía.
  if ((body as Record<string, unknown>).categoriaIds !== undefined) {
    data.categoriaIds = await parseCategoryPreferences(
      (body as Record<string, unknown>).categoriaIds,
    );
  }

  await findCvOrFail(postulanteId);

  return cvRepository.saveCv(postulanteId, data);
}

/**
 * "Mi perfil": datos personales y rubros de interés. Las listas del CV y los
 * PDF no se tocan. El teléfono es obligatorio, como en el registro.
 */
export async function saveProfile(postulanteId: number, body: unknown) {
  assertObject(body, 'Perfil');

  const data = {
    nombre: requiredText(body.nombre, 'El nombre', 100),
    apellido: requiredText(body.apellido, 'El apellido', 100),
    telefono: requiredText(body.telefono, 'El teléfono', 50),
    direccion: optionalText(body.direccion, 'La dirección', 255),
    fechaNacimiento: optionalDate(
      body.fechaNacimiento,
      'La fecha de nacimiento',
    ),
    categoriaIds: await parseCategoryPreferences(body.categoriaIds),
  };

  await findCvOrFail(postulanteId);

  return cvRepository.saveProfile(postulanteId, data);
}

/** El nombre original sin rutas ni caracteres de control, para mostrarlo. */
function cleanFileName(name: string) {
  const base = name.split(/[\\/]/).pop() ?? '';
  // oxlint-disable-next-line no-control-regex
  const clean = base.replace(/[\u0000-\u001f\u007f]/g, '').trim();

  return (clean || 'cv.pdf').slice(0, 255);
}

/**
 * Sube uno o varios PDF. Primero se valida todo (cantidad y contenido) y
 * recién después se sube: si un archivo no es un PDF de verdad no se sube
 * ninguno. Si falla la base después de subir, se borran los archivos para no
 * dejar huérfanos en Storage.
 */
export async function uploadFiles(
  postulanteId: number,
  files: Express.Multer.File[],
) {
  if (files.length === 0) {
    throw new HttpError(400, 'Elegí al menos un PDF');
  }

  await findCvOrFail(postulanteId);

  const current = await cvRepository.countFiles(postulanteId);

  if (current + files.length > CV_MAX_FILES) {
    throw new HttpError(
      400,
      `Podés tener hasta ${CV_MAX_FILES} CV cargados (ya tenés ${current})`,
    );
  }

  const invalid = files.find((file) => !isPdf(file.buffer));

  if (invalid) {
    throw new HttpError(
      400,
      `"${cleanFileName(invalid.originalname)}" no es un PDF válido`,
    );
  }

  const uploaded: string[] = [];

  try {
    for (const file of files) {
      uploaded.push(await uploadCvToStorage(postulanteId, file.buffer));
    }

    return await cvRepository.createFiles(
      postulanteId,
      files.map((file, index) => ({
        archivoUrl: uploaded[index],
        nombreArchivo: cleanFileName(file.originalname),
      })),
    );
  } catch (error) {
    await deleteCvsFromStorage(uploaded).catch(() => undefined);

    throw error;
  }
}

/**
 * El archivo, si es del postulante. Si es de otro se responde como si no
 * existiera, para no revelar qué IDs hay.
 */
async function findOwnFile(postulanteId: number, cvId: number) {
  const file = await cvRepository.findFile(cvId);

  if (!file || file.postulanteId !== postulanteId) {
    throw new HttpError(404, 'CV no encontrado');
  }

  return file;
}

export async function deleteFile(postulanteId: number, cvId: number) {
  const file = await findOwnFile(postulanteId, cvId);

  await cvRepository.deleteFile(file.id);

  // Después de la base: si falla Storage queda un archivo suelto, pero nunca
  // un CV en la lista que no se puede abrir.
  if (file.archivoUrl) {
    await deleteCvsFromStorage([file.archivoUrl]).catch((error: unknown) => {
      if (process.env.NODE_ENV !== 'test') console.error(error);
    });
  }
}

/** Enlace firmado y temporal para ver un CV de un postulante. */
export async function getFileUrl(postulanteId: number, cvId: number) {
  const file = await findOwnFile(postulanteId, cvId);

  if (!file.archivoUrl) {
    throw new HttpError(404, 'El CV no tiene archivo');
  }

  return { url: await getCvSignedUrl(file.archivoUrl) };
}
