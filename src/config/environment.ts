/**
 * Lee y valida la configuración del entorno una sola vez, al arrancar.
 *
 * Por qué acá y no en cada lugar donde se usa: hasta ahora, si faltaba
 * `JWT_SECRET`, el servidor levantaba igual y recién fallaba cuando llegaba un
 * request, con un 500 por cada usuario que intentaba entrar. Un proceso que
 * arranca "bien" y después falla con todo el mundo es peor que uno que se
 * niega a arrancar: así el error aparece en el despliegue, donde alguien lo
 * está mirando, y no en la cara del usuario.
 *
 * Por el mismo motivo junta *todos* los problemas y los informa juntos en vez
 * de cortar en el primero: quien configura el servidor los arregla de una sola
 * pasada en lugar de descubrirlos de a uno.
 */
/**
 * El `.env` se carga acá y no en otro módulo a propósito. Este archivo lee
 * `process.env` en el momento en que se importa, así que si `dotenv` llegara
 * después —por el orden en que Node evalúa los imports— la validación fallaría
 * con un `.env` perfectamente válido. `dotenv` no pisa lo que ya está en el
 * entorno, así que lo que inyecta Vitest o el contenedor sigue ganando.
 */
import 'dotenv/config';

/**
 * Un secreto corto se rompe por fuerza bruta y deja de proteger la firma del
 * JWT, así que uno de cuatro caracteres es casi lo mismo que ninguno. Para
 * HS256, 32 caracteres es el mínimo razonable.
 */
const MIN_SECRET_LENGTH = 32;

/**
 * El mismo valor que ya aplicaba `express.json()` por defecto, ahora escrito.
 * Se deja igual a propósito: este cambio documenta el límite, no lo modifica.
 */
const DEFAULT_BODY_LIMIT = '100kb';

const DEFAULT_ORIGIN = 'http://localhost:5173';

/** `100kb`, `1mb`, `512b`, o un número de bytes a secas. */
const BODY_LIMIT_PATTERN = /^\d+(\.\d+)?\s*(b|kb|mb|gb)?$/i;

export type Environment = {
  readonly databaseUrl: string;
  readonly jwtSecret: string;
  readonly port: number;
  readonly allowedOrigins: readonly string[];
  readonly bodyLimit: string;
  readonly trustProxy: boolean | number;
};

function readPort(raw: string | undefined, problems: string[]): number {
  if (raw === undefined || raw.trim() === '') return 3000;

  const port = Number(raw);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    problems.push(
      `PORT tiene que ser un entero entre 1 y 65535 (llegó "${raw}").`,
    );
    return 3000;
  }

  return port;
}

/**
 * Detrás de un proxy (Nginx, Render, Railway) `req.ip` es la IP del proxy, y
 * el rate limit por IP deja de distinguir usuarios. Pero confiar en
 * `X-Forwarded-For` *sin* un proxy delante es peor: cualquiera puede
 * falsificar la cabecera y evadir el límite. Por eso el valor por defecto es
 * `false` y la decisión queda en el entorno, que es lo único que sabe cómo
 * está desplegado.
 *
 * Se acepta un número de saltos, que es la forma recomendada: `true` confía en
 * toda la cadena de la cabecera y vuelve a abrir la puerta a falsificarla.
 */
function readTrustProxy(
  raw: string | undefined,
  problems: string[],
): boolean | number {
  if (raw === undefined || raw.trim() === '') return false;

  const value = raw.trim().toLowerCase();

  if (value === 'false') return false;
  if (value === 'true') return true;

  const hops = Number(value);

  if (!Number.isInteger(hops) || hops < 0) {
    problems.push(
      `TRUST_PROXY tiene que ser "false", "true" o la cantidad de proxies delante de la app (llegó "${raw}").`,
    );
    return false;
  }

  return hops;
}

function readBodyLimit(raw: string | undefined, problems: string[]): string {
  if (raw === undefined || raw.trim() === '') return DEFAULT_BODY_LIMIT;

  const value = raw.trim();

  if (!BODY_LIMIT_PATTERN.test(value)) {
    problems.push(
      `BODY_LIMIT tiene que ser un tamaño como "100kb" o "1mb" (llegó "${raw}").`,
    );
    return DEFAULT_BODY_LIMIT;
  }

  return value;
}

/**
 * Orígenes separados por coma. Si no se define, solo el frontend de
 * desarrollo: una lista vacía en `cors` significaría "ninguno", y un `*` con
 * `credentials: true` lo rechaza el navegador, así que ninguno de los dos
 * sirve como valor por omisión.
 */
function readAllowedOrigins(raw: string | undefined): string[] {
  const origins = (raw ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  return origins.length > 0 ? origins : [DEFAULT_ORIGIN];
}

export function loadEnvironment(
  env: NodeJS.ProcessEnv = process.env,
): Environment {
  const problems: string[] = [];

  const databaseUrl = env.DB_URL?.trim();

  if (!databaseUrl) {
    problems.push(
      'DB_URL no está definida: sin cadena de conexión la aplicación no puede leer ni escribir nada.',
    );
  }

  const jwtSecret = env.JWT_SECRET?.trim();

  if (!jwtSecret) {
    problems.push(
      'JWT_SECRET no está definida: sin ella no se pueden firmar ni verificar las sesiones.',
    );
  } else if (jwtSecret.length < MIN_SECRET_LENGTH) {
    problems.push(
      `JWT_SECRET tiene ${jwtSecret.length} caracteres y necesita al menos ${MIN_SECRET_LENGTH}: un secreto corto se rompe por fuerza bruta. En .env.example está el comando para generar uno.`,
    );
  }

  const port = readPort(env.PORT, problems);
  const bodyLimit = readBodyLimit(env.BODY_LIMIT, problems);
  const trustProxy = readTrustProxy(env.TRUST_PROXY, problems);
  const allowedOrigins = readAllowedOrigins(env.CORS_ORIGIN);

  if (problems.length > 0) {
    throw new Error(
      [
        'La configuración del entorno no es válida, el servidor no arranca:',
        ...problems.map((problem) => `  - ${problem}`),
        '',
        'Revisar el archivo .env (hay una plantilla en .env.example).',
      ].join('\n'),
    );
  }

  return Object.freeze({
    databaseUrl: databaseUrl!,
    jwtSecret: jwtSecret!,
    port,
    allowedOrigins: Object.freeze(allowedOrigins),
    bodyLimit,
    trustProxy,
  });
}

/**
 * Se valida al importar el módulo, no al recibir el primer request: cualquier
 * cosa que arranque la aplicación —el servidor, los tests, el script de
 * inventario— falla acá si la configuración está incompleta.
 */
export const environment = loadEnvironment();
