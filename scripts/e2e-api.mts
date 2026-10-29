/**
 * La API para los tests punta a punta (E2E) del frontend.
 *
 *   pnpm e2e:api
 *
 * La arranca Playwright desde el repo del frontend (`ccisj-frontend/e2e`), que
 * espera que este repo esté al lado. También se puede correr a mano para ver
 * qué pasa. Qué hace:
 *
 * 1. Deja lista la base de pruebas de Docker (`pnpm test:db`: la levanta si
 *    no está, y le aplica migraciones y seed). NUNCA corre contra Supabase:
 *    `DB_URL` apunta a la base local, y se verifica el host antes.
 * 2. Arranca el Storage falso (`storage-falso-http.mts`) en el 3202: los
 *    comprobantes y los CV se suben y se abren de verdad, pero no salen de la
 *    máquina.
 * 3. Arranca la API en el 3201, con `NODE_ENV=test` (sin rate limits: un E2E
 *    inicia sesión muchas veces seguidas) y aceptando el frontend del 5273.
 *
 * Queda corriendo hasta que se lo corta (Ctrl+C, o Playwright al terminar).
 * Los datos que crean los tests quedan en la base de pruebas, como los de
 * los tests de integración: cada test usa datos nuevos, así que no chocan.
 */
import { type ChildProcess, spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { arrancarStorageFalso } from './storage-falso-http.mjs';
import { TEST_DB_URL } from './test-db-url.mjs';

const PUERTO_API = 3201;
const PUERTO_STORAGE = 3202;
const FRONTEND = 'http://localhost:5273';

const RAIZ = fileURLToPath(new URL('..', import.meta.url));

function abortar(mensaje: string): never {
  console.error(`\n${mensaje}\n`);
  process.exit(1);
}

function verificarBaseLocal() {
  const host = new URL(TEST_DB_URL).hostname;

  // Los tests crean socios, pagos y postulaciones.
  if (!['localhost', '127.0.0.1', '::1'].includes(host)) {
    abortar(
      `La API de los E2E se niega a correr contra "${host}": solo contra la base local de docker-compose.test.yml.`,
    );
  }
}

function prepararBase() {
  console.log('\n→ Base de pruebas');

  // Una sola cadena con `shell: true`, por lo mismo que en `test-db.mts`: en
  // Windows `pnpm` es un `.cmd`. El comando es una constante.
  const resultado = spawnSync('pnpm test:db', {
    stdio: 'inherit',
    shell: true,
  });

  if (resultado.status !== 0)
    abortar('No se pudo preparar la base de pruebas.');
}

function arrancarApi(): ChildProcess {
  console.log(`\n→ API en http://localhost:${PUERTO_API}`);

  const api = spawn(process.execPath, ['--import', 'tsx', 'src/server.ts'], {
    cwd: RAIZ,
    stdio: ['ignore', 'inherit', 'inherit'],
    env: {
      ...process.env,
      NODE_ENV: 'test',
      PORT: String(PUERTO_API),
      DB_URL: TEST_DB_URL,
      // Un secreto nuevo en cada corrida: el del `.env` de cada uno no tiene
      // por qué pasar por acá.
      JWT_SECRET: randomBytes(48).toString('hex'),
      CORS_ORIGIN: FRONTEND,
      // 127.0.0.1 y no `localhost`: Node prueba primero `::1`, y el Storage
      // falso escucha solo en IPv4. `dotenv` no pisa una variable que ya
      // existe, así que esto gana sobre las claves reales del `.env`.
      SUPABASE_URL: `http://127.0.0.1:${PUERTO_STORAGE}`,
      SUPABASE_SERVICE_ROLE_KEY: 'clave-del-storage-falso',
      // Vacías por lo mismo: ningún correo de un test puede salir.
      RESEND_API_KEY: '',
      EMAIL_WORKER_ENABLED: 'false',
    },
  });

  api.on('exit', (codigo) => {
    abortar(`La API se cerró (código ${codigo}).`);
  });

  return api;
}

verificarBaseLocal();
prepararBase();

const storage = await arrancarStorageFalso(PUERTO_STORAGE);
console.log(`\n→ Storage falso en http://127.0.0.1:${PUERTO_STORAGE}`);

const api = arrancarApi();

function apagar() {
  api.removeAllListeners('exit');
  api.kill();
  storage.close();
  process.exit(0);
}

process.on('SIGINT', apagar);
process.on('SIGTERM', apagar);
