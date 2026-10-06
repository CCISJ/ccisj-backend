/**
 * Prepara la base de pruebas: le aplica las migraciones y el seed.
 *
 * Se corre con `pnpm test:db:prepare`, después de `pnpm test:db:up`. La base
 * vive en RAM, así que esto hay que rehacerlo cada vez que se levanta el
 * contenedor; son unos segundos.
 *
 * Por qué un script y no `DB_URL=... prisma migrate deploy` en los scripts del
 * package.json: esa sintaxis no funciona en Windows (cmd.exe no entiende las
 * variables puestas adelante), y la mitad del equipo trabaja en Windows.
 */
import { spawnSync } from 'node:child_process';

import { TEST_DB_URL } from './test-db-url.mjs';

// Red de seguridad: este script corre migraciones y seed, o sea que ESCRIBE.
// Si por un `TEST_DB_URL` mal puesto apuntara a Supabase, sembraría la base
// del equipo. Solo se permite una base local.
const HOSTS_PERMITIDOS = ['localhost', '127.0.0.1', '::1'];

function verificarDestino() {
  let host: string;

  try {
    host = new URL(TEST_DB_URL).hostname;
  } catch {
    console.error('TEST_DB_URL no es una URL válida.');
    process.exit(1);
  }

  if (!HOSTS_PERMITIDOS.includes(host)) {
    console.error(
      [
        '',
        `Este script se niega a correr contra "${host}".`,
        '',
        'Aplica migraciones y seed, o sea que escribe en la base. Solo se',
        'permite una base local (ver docker-compose.test.yml). Para migrar la',
        'base compartida del equipo, el comando es `pnpm migrate`, a propósito.',
        '',
      ].join('\n'),
    );

    process.exit(1);
  }

  return host;
}

function correr(etiqueta: string, comando: string) {
  console.log(`\n→ ${etiqueta}`);

  // El comando va como una sola cadena y no como `(comando, [args])`: Node
  // avisa (DEP0190) que pasar argumentos sueltos con `shell: true` no los
  // escapa, y eso es una puerta de inyección si alguno viniera de afuera. Acá
  // no viene nada de afuera —son constantes de este archivo—, pero la forma de
  // una sola cadena es la soportada y no deja el aviso dando vueltas.
  //
  // El shell hace falta porque en Windows `pnpm` es un `.cmd`, y desde Node 20
  // un `.cmd` no se puede ejecutar sin shell.
  const resultado = spawnSync(comando, {
    stdio: 'inherit',
    env: { ...process.env, DB_URL: TEST_DB_URL },
    shell: true,
  });

  if (resultado.status !== 0) {
    console.error(`\nFalló: ${etiqueta}`);
    process.exit(resultado.status ?? 1);
  }
}

const host = verificarDestino();

console.log(`Preparando la base de pruebas en ${host}.`);

correr('Migraciones', 'pnpm exec prisma migrate deploy');
correr('Seed', 'pnpm exec tsx prisma/seed.ts');

console.log('\nBase de pruebas lista.');
