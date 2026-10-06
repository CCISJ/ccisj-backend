/**
 * Cadena de conexión de la base de pruebas.
 *
 * Es el único lugar donde vive: la lee `vitest.config.mts` (para que los tests
 * apunten ahí) y `scripts/test-db.ts` (para migrarla y sembrarla). Si estuviera
 * escrita en los dos, un día dejarían de coincidir.
 *
 * No es un secreto: la base corre en la máquina de cada uno, en RAM, con datos
 * inventados (ver `docker-compose.test.yml`). Por eso va en el repositorio y no
 * en un `.env`: así nadie tiene que configurar nada para correr los tests.
 *
 * `TEST_DB_URL` permite pisarla, y es lo que usa el servidor de integración
 * continua, que levanta su propio PostgreSQL.
 */
export const TEST_DB_URL =
  process.env.TEST_DB_URL ??
  'postgresql://ccisj_test:ccisj_test@localhost:5433/ccisj_test';

/**
 * Los tests firman cookies de sesión con este secreto en vez de con el del
 * `.env` de cada uno. Dos motivos: los tests no deberían depender de la
 * configuración personal de nadie (en integración continua no hay `.env`), y
 * el secreto real de un desarrollador no tiene por qué pasar por el proceso de
 * los tests. No protege nada: la base dura lo que dura la corrida.
 */
export const TEST_JWT_SECRET =
  'secreto-solo-para-los-tests-no-es-de-produccion';
