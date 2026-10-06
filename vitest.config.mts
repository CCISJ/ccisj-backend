import { URL, fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// La extensión `.js` es a propósito: este archivo es ESM (`.mts`), y en ESM el
// import se escribe como va a quedar después de compilar. Vite lo resuelve al
// `.ts` igual.
import { TEST_DB_URL, TEST_JWT_SECRET } from './scripts/test-db-url.mjs';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },

  test: {
    environment: 'node',

    // Corta con un mensaje claro si la base de pruebas no está levantada o
    // está vacía, en vez de dejar 306 tests fallando por conexión.
    globalSetup: ['./tests/global-setup.ts'],

    // Los tests corren contra la base desechable de `docker-compose.test.yml`,
    // NO contra la base compartida del equipo. Se define acá y no en un `.env`
    // para que nadie tenga que acordarse de configurarlo: si el contenedor no
    // está levantado, los tests fallan al conectar en vez de escribir en la
    // base de todos.
    //
    // `dotenv` no pisa lo que ya está en el entorno, así que estos valores le
    // ganan al `.env` de cada uno.
    env: {
      DB_URL: TEST_DB_URL,
      JWT_SECRET: TEST_JWT_SECRET,
    },

    // Con la base local una consulta tarda ~1 ms en vez de los ~200 ms que
    // costaba ir hasta Supabase. Igual se deja un margen holgado: hay tests que
    // encadenan varios requests y Argon2 es lento a propósito.
    testTimeout: 15_000,
    hookTimeout: 15_000,

    // Estaba en 2 para no castigar la base compartida con 4 procesos
    // escribiendo a la vez. Contra la base local eso ya no es un problema.
    // Medido: 2 workers 17,5 s / 4 workers 12,1 s / 6 workers 11,3 s. De 4 en
    // adelante la ganancia es mínima y la concurrencia solo agrega riesgo de
    // tests que se pisan, así que 4.
    maxWorkers: 4,
  },
});
