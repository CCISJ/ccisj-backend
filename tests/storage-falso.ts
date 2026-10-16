/**
 * Supabase Storage en memoria, para los tests que suben comprobantes.
 *
 * Storage es un servicio externo, así que en los tests se reemplaza por este.
 * Todo lo demás corre de verdad: multer, la detección del tipo por el
 * contenido, la base y las rutas. Se usa así, en cada archivo de tests:
 *
 * ```ts
 * vi.mock('../src/config/supabase', async (importOriginal) => {
 *   const original =
 *     await importOriginal<typeof import('../src/config/supabase')>();
 *   const { supabaseFalso } = await import('./storage-falso.js');
 *
 *   return { ...original, getSupabase: () => supabaseFalso };
 * });
 * ```
 *
 * `importOriginal` mantiene `StorageError`, que el código de verdad usa para
 * distinguir una falla de Storage de un error de negocio.
 */
export const storageFalso = {
  /** ruta → tipo de contenido con el que se guardó */
  files: new Map<string, string>(),
  /** Si es `true`, la próxima subida falla como si el bucket no existiera. */
  failing: false,

  reset() {
    this.files.clear();
    this.failing = false;
  },
};

const bucket = {
  upload(path: string, _body: Uint8Array, options: { contentType: string }) {
    if (storageFalso.failing) {
      return Promise.resolve({
        error: { message: 'Bucket not found: comprobantes' },
      });
    }

    storageFalso.files.set(path, options.contentType);

    return Promise.resolve({ error: null });
  },

  remove(paths: string[]) {
    for (const path of paths) {
      storageFalso.files.delete(path);
    }

    return Promise.resolve({ error: null });
  },

  createSignedUrl(path: string, expiresIn: number) {
    return Promise.resolve({
      data: { signedUrl: `https://storage.test/${path}?expira=${expiresIn}` },
      error: null,
    });
  },
};

export const supabaseFalso = { storage: { from: () => bucket } };
