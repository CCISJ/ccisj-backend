/**
 * Prueba la conexión con Supabase Storage: lista los primeros archivos del
 * bucket de comprobantes.
 *
 * No es un test de la suite (no corre con `pnpm test`): necesita las
 * credenciales reales del `.env`. Se corre a mano con:
 *
 *   pnpm exec tsx scripts/probar-supabase.mts
 */
import 'dotenv/config';

import { getSupabase } from '../src/config/supabase.js';

async function testSupabase() {
  const { data, error } = await getSupabase()
    .storage.from('comprobantes')
    .list('', { limit: 10 });

  if (error) {
    console.error('❌ Error al conectar con Supabase:', error.message);
    return;
  }

  console.log('✅ Conexión con Supabase Storage exitosa');
  console.log('Archivos encontrados:', data.length);
}

await testSupabase();
