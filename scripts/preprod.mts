/**
 * Levanta la preproducción local (`docker-compose.preprod.yml`): las
 * imágenes de producción de la API y del frontend, detrás de HTTPS, sobre una
 * base propia. Ver `preprod/README.md`.
 *
 *   pnpm preprod          construye y levanta todo, y espera a que responda
 *   pnpm preprod:down     lo apaga (la base vive en RAM: se borra)
 *
 * Existe para generar el JWT_SECRET: uno nuevo en cada arranque, que no es el
 * del `.env` de desarrollo y no queda escrito en ningún lado.
 */
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';

const resultado = spawnSync(
  'docker compose -f docker-compose.preprod.yml up -d --build --wait',
  {
    stdio: 'inherit',
    shell: true,
    env: {
      ...process.env,
      PREPROD_JWT_SECRET: randomBytes(48).toString('hex'),
    },
  },
);

if (resultado.status !== 0) {
  console.error('\nNo se pudo levantar la preproducción.');
  process.exit(resultado.status ?? 1);
}

console.log(
  [
    '',
    'Preproducción lista: https://ccisj.localhost:8443',
    '',
    'El navegador va a avisar que no conoce el certificado (es de Caddy, local).',
    'Para verificar el hardening: pnpm preprod:verificar',
  ].join('\n'),
);
