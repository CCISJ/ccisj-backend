import { type SupabaseClient, createClient } from '@supabase/supabase-js';

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
    throw new Error('Falta configurar Supabase Storage');
  }

  client = createClient(supabaseUrl, supabaseKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return client;
}
