import { randomUUID } from 'node:crypto';

import { supabase } from '@/config/supabase';

const BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'comprobantes';

function getFileExtension(buffer: Buffer): string {
  if (buffer.subarray(0, 5).toString() === '%PDF-') {
    return 'pdf';
  }

  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return 'jpg';
  }

  if (
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  ) {
    return 'png';
  }

  throw new Error('El archivo no es un PDF, JPG o PNG válido');
}

export async function uploadReceiptToStorage(
  movementId: number,
  file: Express.Multer.File,
) {
  const extension = getFileExtension(file.buffer);

  const contentTypes: Record<string, string> = {
    pdf: 'application/pdf',
    jpg: 'image/jpeg',
    png: 'image/png',
  };

  const path = `movimientos/${movementId}/${randomUUID()}.${extension}`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, new Uint8Array(file.buffer), {
      contentType: contentTypes[extension],
      upsert: false,
    });

  if (error) {
    throw new Error(`Error al subir el comprobante: ${error.message}`);
  }

  return path;
}

export async function deleteReceiptFromStorage(path: string) {
  const { error } = await supabase.storage.from(BUCKET).remove([path]);

  if (error) {
    throw new Error(`Error al eliminar el comprobante: ${error.message}`);
  }
}

export async function getReceiptSignedUrl(path: string) {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, 60);

  if (error || !data) {
    throw new Error('No se pudo obtener el comprobante');
  }

  return data.signedUrl;
}
