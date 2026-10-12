import { type SupabaseClient, createClient } from '@supabase/supabase-js';

/**
 * Una falla de Storage (o de su configuración), no del usuario. Tiene su propia
 * clase para que `sendError` no la confunda con un error de negocio
 * (`new Error`), que se le muestra tal cual: el detalle queda en el log del
 * servidor y el usuario recibe un 500 con el mensaje genérico del controller.
 */
export class StorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StorageError';
  }
}

let client: SupabaseClient | undefined;

// El cliente se crea la primera vez que se usa y no al importar el módulo.
// Si fallara al importarse, cualquier cosa que cargue la app (los tests, un
// entorno sin Storage configurado) se caería entera aunque nunca toque un
// comprobante. Así, sin las variables, falla solo lo que usa Storage.
export function getSupabase() {
  if (client) {
    return client;
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new StorageError('Falta configurar Supabase Storage');
  }

  client = createClient(supabaseUrl, supabaseKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return client;
}
