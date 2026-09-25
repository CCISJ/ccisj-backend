import { URL, fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },

  test: {
    environment: 'node',

    // Los tests pegan contra la base de Supabase, a ~200 ms por consulta desde
    // una máquina de desarrollo, y cada request autenticado además verifica
    // la sesión en la base. Los 5 s por defecto no alcanzan para los tests que
    // encadenan varios requests.
    testTimeout: 30_000,
    hookTimeout: 30_000,

    maxWorkers: 2,
  },
});
