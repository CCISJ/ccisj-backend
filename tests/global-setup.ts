/**
 * Se ejecuta una vez, antes de todos los tests.
 *
 * Existe por los mensajes de error. La base de pruebas vive en RAM: después de
 * reiniciar la máquina el contenedor está apagado y, sin esto, los 306 tests
 * fallan con "Can't reach database server at localhost:5433" repetido 306
 * veces. El riesgo real no es la molestia: es que alguien lo "arregle"
 * apuntando `DB_URL` a Supabase y vuelva a escribir en la base del equipo.
 */
import { Client } from 'pg';

import { TEST_DB_URL } from '../scripts/test-db-url.mjs';

function abortar(mensaje: string[]): never {
  console.error(['', ...mensaje, ''].join('\n'));
  process.exit(1);
}

export default async function setup() {
  // Defensa en profundidad: aunque la configuración apunte a la base local,
  // acá se verifica que nadie la haya pisado con la base compartida.
  if (/supabase|pooler/i.test(TEST_DB_URL)) {
    abortar([
      'Los tests están apuntando a la base COMPARTIDA del equipo.',
      '',
      'Escriben de verdad: crean socios, ofertas, pagos y movimientos de',
      'caja. Corren solo contra la base desechable de',
      'docker-compose.test.yml.',
    ]);
  }

  const client = new Client({ connectionString: TEST_DB_URL });

  try {
    await client.connect();
  } catch {
    abortar([
      'No se pudo conectar a la base de pruebas.',
      '',
      'Levantala con:   pnpm test:db',
      '',
      '(Vive en RAM, así que hay que rehacerlo cada vez que se reinicia la',
      'máquina o se apaga Docker. Son unos segundos.)',
    ]);
  }

  try {
    // Si la base está vacía, las migraciones no se aplicaron todavía.
    await client.query('select 1 from usuario limit 1');
  } catch {
    abortar([
      'La base de pruebas está levantada pero vacía.',
      '',
      'Aplicale las migraciones y el seed con:   pnpm test:db:prepare',
    ]);
  } finally {
    await client.end();
  }
}
