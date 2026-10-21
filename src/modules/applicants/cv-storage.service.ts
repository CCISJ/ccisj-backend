import { randomUUID } from 'node:crypto';

import { StorageError, getSupabase } from '@/config/supabase';

// Por defecto, el mismo bucket que los comprobantes (en su carpeta `cvs/`),
// para no tener que crear nada nuevo en Supabase. Se puede separar con
// SUPABASE_CV_BUCKET.
const BUCKET =
  process.env.SUPABASE_CV_BUCKET ||
  process.env.SUPABASE_STORAGE_BUCKET ||
  'comprobantes';

/** Cuánto dura el enlace firmado para ver un CV. */
const SIGNED_URL_SECONDS = 60;

export function isPdf(buffer: Buffer) {
  return buffer.subarray(0, 5).toString() === '%PDF-';
}

export async function uploadCvToStorage(postulanteId: number, buffer: Buffer) {
  const path = `cvs/postulante-${postulanteId}/${randomUUID()}.pdf`;

  const { error } = await getSupabase()
    .storage.from(BUCKET)
    .upload(path, new Uint8Array(buffer), {
      contentType: 'application/pdf',
      upsert: false,
    });

  if (error) {
    throw new StorageError(`Error al subir el CV: ${error.message}`);
  }

  return path;
}

export async function deleteCvsFromStorage(paths: string[]) {
  if (paths.length === 0) return;

  const { error } = await getSupabase().storage.from(BUCKET).remove(paths);

  if (error) {
    throw new StorageError(`Error al eliminar el CV: ${error.message}`);
  }
}

export async function getCvSignedUrl(path: string) {
  const { data, error } = await getSupabase()
    .storage.from(BUCKET)
    .createSignedUrl(path, SIGNED_URL_SECONDS);

  if (error || !data) {
    throw new StorageError(`No se pudo obtener el CV: ${error?.message}`);
  }

  return data.signedUrl;
}
