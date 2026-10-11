import 'dotenv/config';

import { supabase } from '../src/config/supabase';

async function testSupabase() {
  const { data, error } = await supabase.storage
    .from('comprobantes')
    .list('', { limit: 10 });

  if (error) {
    console.error('❌ Error al conectar con Supabase:', error.message);
    return;
  }

  console.log('✅ Conexión con Supabase Storage exitosa');
  console.log('Archivos encontrados:', data.length);
}

testSupabase();
