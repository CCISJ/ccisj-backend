import { randomUUID } from 'node:crypto';

import { StorageError, getSupabase } from '@/config/supabase';

// Por defecto, el mismo bucket que los comprobantes y los CV (en su carpeta
// `gestoria/`), para no tener que crear nada nuevo en Supabase. Se puede
// separar con SUPABASE_GESTORIA_BUCKET.
const BUCKET =
  process.env.SUPABASE_GESTORIA_BUCKET ||
  process.env.SUPABASE_STORAGE_BUCKET ||
  'comprobantes';

/** Cuánto dura el enlace firmado para abrir un archivo. */
const SIGNED_URL_SECONDS = 60;

const WORD =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const EXCEL =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export type DetectedFile = { extension: string; contentType: string };

/**
 * El tipo real del archivo, por su contenido y no por lo que dice el
 * navegador. Word y Excel son archivos ZIP por dentro: se acepta un ZIP solo
 * si además se declaró como uno de esos dos, y se guarda con ese tipo.
 */
export function detectFileType(
  buffer: Buffer,
  declaredType: string,
): DetectedFile | null {
  if (buffer.subarray(0, 5).toString() === '%PDF-') {
    return { extension: 'pdf', contentType: 'application/pdf' };
  }

  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return { extension: 'jpg', contentType: 'image/jpeg' };
  }

  if (
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  ) {
    return { extension: 'png', contentType: 'image/png' };
  }

  const isZip =
    buffer.length >= 4 &&
    buffer.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]));

  if (isZip && declaredType === WORD) {
    return { extension: 'docx', contentType: WORD };
  }

  if (isZip && declaredType === EXCEL) {
    return { extension: 'xlsx', contentType: EXCEL };
  }

  return null;
}

export async function uploadGestionFileToStorage(
  gestionId: number,
  buffer: Buffer,
  detected: DetectedFile,
) {
  const path = `gestoria/gestion-${gestionId}/${randomUUID()}.${detected.extension}`;

  const { error } = await getSupabase()
    .storage.from(BUCKET)
    .upload(path, new Uint8Array(buffer), {
      contentType: detected.contentType,
      upsert: false,
    });

  if (error) {
    throw new StorageError(`Error al subir el archivo: ${error.message}`);
  }

  return path;
}

export async function deleteGestionFilesFromStorage(paths: string[]) {
  if (paths.length === 0) return;

  const { error } = await getSupabase().storage.from(BUCKET).remove(paths);

  if (error) {
    throw new StorageError(`Error al eliminar el archivo: ${error.message}`);
  }
}

/**
 * Enlace firmado y de corta duración. Word y Excel se descargan con el nombre
 * con el que se subieron; PDF e imágenes se abren en el navegador.
 */
export async function getGestionFileSignedUrl(
  path: string,
  nombre: string,
  contentType: string,
) {
  const download = contentType === WORD || contentType === EXCEL;

  const { data, error } = await getSupabase()
    .storage.from(BUCKET)
    .createSignedUrl(
      path,
      SIGNED_URL_SECONDS,
      download ? { download: nombre } : undefined,
    );

  if (error || !data) {
    throw new StorageError(`No se pudo obtener el archivo: ${error?.message}`);
  }

  return data.signedUrl;
}
