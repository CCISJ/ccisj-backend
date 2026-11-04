/**
 * Respaldo de la base y su restauración, y el simulacro que prueba que un
 * respaldo de verdad se puede restaurar. Ver `respaldo/README.md`.
 *
 *   pnpm respaldo              respalda la base de RESPALDO_DB_URL
 *   pnpm respaldo:restaurar <archivo>
 *                              lo restaura en la base de RESTAURAR_DB_URL,
 *                              que tiene que estar vacía
 *   pnpm respaldo:probar       el simulacro, sobre la base de pruebas local
 *
 * Las herramientas de PostgreSQL (`pg_dump`, `pg_restore`, `psql`) corren en
 * un contenedor de `postgres:17-alpine`, así que alcanza con Docker: no hay que
 * instalar nada, y la versión es la misma línea que la de Supabase. `pg_dump`
 * tiene que ser de una versión igual o mayor que la del servidor.
 *
 * La cadena de conexión llega al contenedor por una variable de entorno y no
 * como argumento, para que la contraseña no quede en la lista de procesos.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';

import { TEST_DB_URL } from './test-db-url.mjs';

const IMAGEN = 'postgres:17-alpine';
const SALIDA = resolve(import.meta.dirname, '../respaldo/salida');
const HOSTS_LOCALES = ['localhost', '127.0.0.1', '::1', '[::1]'];

// Parámetros de la cadena de conexión que entiende Prisma y no libpq:
// `pg_dump` se niega a arrancar si los ve.
const SOLO_DE_PRISMA = [
  'schema',
  'pgbouncer',
  'connection_limit',
  'pool_timeout',
  'socket_timeout',
  'statement_cache_size',
];

class ErrorDeRespaldo extends Error {}

/**
 * La cadena de conexión tal como la tiene que ver el contenedor: sin los
 * parámetros de Prisma, y con `localhost` cambiado por el host de Docker
 * (dentro del contenedor, `localhost` es el propio contenedor).
 */
function paraElContenedor(url: string) {
  let destino: URL;

  try {
    destino = new URL(url);
  } catch {
    throw new ErrorDeRespaldo('La cadena de conexión no es una URL válida.');
  }

  for (const parametro of SOLO_DE_PRISMA) {
    destino.searchParams.delete(parametro);
  }

  if (HOSTS_LOCALES.includes(destino.hostname)) {
    destino.hostname = 'host.docker.internal';
  }

  return destino.toString();
}

function esLocal(url: string) {
  return HOSTS_LOCALES.includes(new URL(url).hostname);
}

function conBase(url: string, base: string) {
  const otra = new URL(url);
  otra.pathname = `/${base}`;

  return otra.toString();
}

type Contenedor = {
  url: string;
  comando: string;
  carpeta?: string;
  entrada?: string;
};

/**
 * Corre `comando` (un script de sh) en un contenedor de PostgreSQL, con la
 * base en `$PGURL` y, si hay `carpeta`, esa carpeta montada en `/respaldo`.
 */
function enContenedor({ url, comando, carpeta, entrada }: Contenedor) {
  const args = [
    'run',
    '--rm',
    '-i',
    // En Docker Desktop ya existe; en Linux hay que declararlo.
    '--add-host=host.docker.internal:host-gateway',
    '-e',
    'PGURL',
  ];

  if (carpeta) {
    args.push('--mount', `type=bind,src=${carpeta},dst=/respaldo`);

    // En Linux, que el archivo quede del usuario y no de root.
    if (process.getuid && process.getgid) {
      args.push('--user', `${process.getuid()}:${process.getgid()}`);
    }
  }

  args.push(IMAGEN, 'sh', '-c', comando);

  const resultado = spawnSync('docker', args, {
    env: { ...process.env, PGURL: paraElContenedor(url) },
    input: entrada,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  });

  if (resultado.error) {
    throw new ErrorDeRespaldo(
      `No se pudo ejecutar Docker (${resultado.error.message}). ¿Está corriendo?`,
    );
  }

  if (resultado.status !== 0) {
    throw new ErrorDeRespaldo(
      resultado.stderr.trim() || 'Falló el contenedor.',
    );
  }

  return resultado.stdout;
}

/** Una consulta con `psql`: devuelve las filas, con columnas separadas por tab. */
function consultar(url: string, sql: string) {
  const salida = enContenedor({
    url,
    comando: 'psql -X -At -F "\t" -v ON_ERROR_STOP=1 -d "$PGURL" -f -',
    entrada: sql,
  });

  return salida
    .split('\n')
    .filter((linea) => linea !== '')
    .map((linea) => linea.split('\t'));
}

/**
 * Respalda la base de `url` en `archivo`, en el formato propio de
 * `pg_dump` (comprimido, y `pg_restore` puede elegir qué restaurar).
 *
 * Solo el esquema `public`, que es el de la aplicación: en Supabase hay otros
 * (`auth`, `storage`…) que son de la plataforma y no se restauran en otro
 * PostgreSQL. Sin dueños ni permisos, para que se pueda restaurar con otro
 * usuario. El historial de migraciones (`_prisma_migrations`) está en
 * `public`, así que viaja con los datos.
 */
export function respaldar(url: string, archivo: string) {
  mkdirSync(dirname(archivo), { recursive: true });

  enContenedor({
    url,
    carpeta: dirname(archivo),
    comando: `pg_dump -Fc --no-owner --no-privileges -n public -d "$PGURL" -f "/respaldo/${basename(archivo)}"`,
  });

  return statSync(archivo).size;
}

/** Cuántos objetos (tablas, secuencias, índices…) hay en `public`. */
function objetosEnPublic(url: string) {
  const [[cantidad]] = consultar(
    url,
    `SELECT count(*) FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public';`,
  );

  return Number(cantidad);
}

/**
 * Restaura `archivo` en la base de `url`, **que tiene que estar vacía**.
 *
 * Esa es la regla de seguridad: restaurar no pisa nada, solo llena una base
 * nueva. Así no hay forma de que un error de tipeo borre la base de alguien,
 * y es lo que se hace ante un desastre de verdad: se crea una base nueva, se
 * restaura ahí y se apunta la API a ella.
 *
 * Todo o nada (`--single-transaction` y `--exit-on-error`): si algo falla, la
 * base queda vacía como estaba, nunca a medias.
 */
export function restaurar(archivo: string, url: string) {
  const objetos = objetosEnPublic(url);

  if (objetos > 0) {
    throw new ErrorDeRespaldo(
      [
        `La base de destino no está vacía: tiene ${objetos} objetos en "public".`,
        'Restaurar solo llena una base nueva, nunca pisa una que tenga datos.',
      ].join('\n'),
    );
  }

  // La base nueva ya trae el esquema `public`, y el respaldo también lo crea:
  // sin sacar esa entrada (y su comentario), la restauración falla en la
  // primera línea con "schema public already exists".
  enContenedor({
    url,
    carpeta: dirname(resolve(archivo)),
    comando: [
      `pg_restore -l "/respaldo/${basename(archivo)}"`,
      `| grep -vE '(SCHEMA - public|COMMENT - SCHEMA public) ' > /tmp/lista`,
      `&& pg_restore -L /tmp/lista --no-owner --no-privileges`,
      `--single-transaction --exit-on-error -d "$PGURL" "/respaldo/${basename(archivo)}"`,
    ].join(' '),
  });
}

// ---------------------------------------------------------------------------
// El simulacro
// ---------------------------------------------------------------------------

/**
 * Una huella de cada tabla: cuántas filas tiene y un md5 de todo su contenido,
 * ordenado. Dos bases con la misma huella tienen exactamente los mismos datos.
 */
function huellaDeLosDatos(url: string) {
  const tablas = consultar(
    url,
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY 1;`,
  ).map(([tabla]) => tabla);

  if (tablas.length === 0) {
    return new Map<string, string>();
  }

  const sql = tablas
    .map(
      (tabla) =>
        `SELECT '${tabla}', count(*), md5(coalesce(string_agg(t::text, E'\\n' ORDER BY t::text), '')) FROM public."${tabla}" t`,
    )
    .join('\nUNION ALL\n');

  return new Map(
    consultar(url, `${sql};`).map(([tabla, filas, md5]) => [
      tabla,
      `${filas} filas, md5 ${md5}`,
    ]),
  );
}

/**
 * Dónde quedó cada secuencia. Si se restauran los datos pero no las
 * secuencias, la base parece sana y el primer alta nueva choca con un id que
 * ya existe.
 */
function huellaDeLasSecuencias(url: string) {
  return new Map(
    consultar(
      url,
      `SELECT sequencename, coalesce(last_value::text, 'sin usar')
         FROM pg_sequences WHERE schemaname = 'public' ORDER BY 1;`,
    ).map(([secuencia, valor]) => [secuencia, valor]),
  );
}

/**
 * La estructura completa (tablas, columnas, índices, claves, tipos), como la
 * escribe `pg_dump`, sin los comentarios que cambian entre corridas.
 */
function estructura(url: string) {
  return enContenedor({
    url,
    comando:
      'pg_dump --schema-only --no-owner --no-privileges -n public -d "$PGURL"',
  })
    .split('\n')
    .filter(
      (linea) =>
        !linea.startsWith('--') &&
        // Desde PostgreSQL 17.6, `pg_dump` abre y cierra con una clave al azar.
        !linea.startsWith('\\restrict') &&
        !linea.startsWith('\\unrestrict'),
    )
    .join('\n')
    .trim();
}

function diferencias(
  que: string,
  original: Map<string, string>,
  restaurada: Map<string, string>,
) {
  const errores: string[] = [];

  for (const [nombre, valor] of original) {
    const otro = restaurada.get(nombre);

    if (otro === undefined) {
      errores.push(`${que} "${nombre}": no está en la restaurada.`);
    } else if (otro !== valor) {
      errores.push(`${que} "${nombre}": ${valor} → ${otro}.`);
    }
  }

  for (const nombre of restaurada.keys()) {
    if (!original.has(nombre)) {
      errores.push(`${que} "${nombre}": sobra en la restaurada.`);
    }
  }

  return errores;
}

function correrPnpm(etiqueta: string, comando: string, url: string) {
  console.log(`  ${etiqueta}…`);

  // Una sola cadena con shell, como en `test-db.mts`: en Windows `pnpm` es un
  // `.cmd`, y no se puede ejecutar sin shell.
  const resultado = spawnSync(comando, {
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
    env: {
      ...process.env,
      DB_URL: url,
      NODE_ENV: 'test',
      ALLOW_DEMO_SEED: 'true',
    },
    shell: true,
  });

  if (resultado.status !== 0) {
    throw new ErrorDeRespaldo(
      `Falló: ${etiqueta}\n${resultado.stdout}\n${resultado.stderr}`,
    );
  }

  return resultado.stdout;
}

function segundos(desde: number) {
  return `${((performance.now() - desde) / 1000).toFixed(1)} s`;
}

/**
 * El simulacro: arma una base con las migraciones y el seed, la respalda con
 * `respaldar`, restaura ese archivo en otra base vacía con `restaurar` (las
 * mismas funciones que se usan de verdad) y compara las dos.
 *
 * Corre sobre el PostgreSQL de la base de pruebas (`pnpm test:db:up`), pero
 * en dos bases propias que crea y borra: no depende de lo que hayan dejado
 * los tests, y se puede correr mientras corren.
 */
function simulacro() {
  if (!esLocal(TEST_DB_URL)) {
    throw new ErrorDeRespaldo(
      'El simulacro crea y borra bases: solo corre contra un PostgreSQL local.',
    );
  }

  const original = conBase(TEST_DB_URL, 'ccisj_simulacro_original');
  const restaurada = conBase(TEST_DB_URL, 'ccisj_simulacro_restaurada');
  const carpeta = mkdtempSync(join(tmpdir(), 'ccisj-simulacro-'));
  const archivo = join(carpeta, 'ccisj.dump');

  const crearBases = `
    DROP DATABASE IF EXISTS ccisj_simulacro_original WITH (FORCE);
    DROP DATABASE IF EXISTS ccisj_simulacro_restaurada WITH (FORCE);
    CREATE DATABASE ccisj_simulacro_original;
    CREATE DATABASE ccisj_simulacro_restaurada;`;
  const borrarBases = `
    DROP DATABASE IF EXISTS ccisj_simulacro_original WITH (FORCE);
    DROP DATABASE IF EXISTS ccisj_simulacro_restaurada WITH (FORCE);`;

  try {
    console.log('1. Una base con datos, como la de producción');
    consultar(TEST_DB_URL, crearBases);
    correrPnpm('migraciones', 'pnpm exec prisma migrate deploy', original);
    correrPnpm(
      'seed con los datos de demostración',
      'pnpm exec tsx prisma/seed.ts',
      original,
    );

    console.log('2. El respaldo');
    let desde = performance.now();
    const tamaño = respaldar(original, archivo);
    console.log(`  ${(tamaño / 1024).toFixed(0)} KB en ${segundos(desde)}`);

    console.log('3. La restauración, en una base vacía');
    desde = performance.now();
    restaurar(archivo, restaurada);
    console.log(`  restaurada en ${segundos(desde)}`);

    console.log('4. La comparación');
    const datos = huellaDeLosDatos(original);
    const secuencias = huellaDeLasSecuencias(original);
    const errores = [
      ...diferencias('Tabla', datos, huellaDeLosDatos(restaurada)),
      ...diferencias(
        'Secuencia',
        secuencias,
        huellaDeLasSecuencias(restaurada),
      ),
    ];

    if (estructura(original) !== estructura(restaurada)) {
      errores.push('La estructura (tablas, índices, claves) no es la misma.');
    }

    // Prisma tiene que ver la base restaurada al día: si no, el próximo
    // despliegue intentaría migrarla de nuevo.
    try {
      correrPnpm(
        'Prisma la ve al día',
        'pnpm exec prisma migrate status',
        restaurada,
      );
    } catch {
      errores.push(
        'Prisma no ve la base restaurada al día con las migraciones.',
      );
    }

    const filas = [...datos.values()].reduce(
      (total, huella) => total + Number(huella.split(' ')[0]),
      0,
    );

    if (errores.length > 0) {
      console.error(
        `\n✗ La restauración NO es fiel:\n  ${errores.join('\n  ')}`,
      );
      process.exitCode = 1;

      return;
    }

    console.log(
      [
        '',
        `✓ Restauración fiel: ${datos.size} tablas y ${filas} filas idénticas`,
        `  (md5 de cada tabla), ${secuencias.size} secuencias en el mismo valor,`,
        '  la misma estructura y Prisma la ve al día.',
      ].join('\n'),
    );
  } finally {
    rmSync(carpeta, { recursive: true, force: true });
    consultar(TEST_DB_URL, borrarBases);
  }
}

function urlDe(variable: string) {
  const url = process.env[variable];

  if (!url) {
    throw new ErrorDeRespaldo(
      `Falta ${variable}: la cadena de conexión de la base (ver respaldo/README.md).`,
    );
  }

  return url;
}

function main() {
  const [accion, archivo] = process.argv.slice(2);

  switch (accion) {
    case 'crear': {
      // A propósito no toma DB_URL: en desarrollo es la base del equipo, y
      // respaldarla sin querer deja sus datos en un archivo suelto.
      const url = urlDe('RESPALDO_DB_URL');
      const nombre = `ccisj-${new Date().toISOString().slice(0, 16).replace(/[-:]/g, '')}Z.dump`;
      const destino = join(SALIDA, nombre);
      const tamaño = respaldar(url, destino);

      console.log(
        [
          `Respaldo en ${destino} (${(tamaño / 1024).toFixed(0)} KB).`,
          '',
          'Tiene datos personales y los hashes de las contraseñas: guardalo',
          'cifrado y fuera del repositorio (respaldo/salida/ no se versiona).',
        ].join('\n'),
      );
      break;
    }

    case 'restaurar': {
      if (!archivo) {
        throw new ErrorDeRespaldo(
          'Uso: pnpm respaldo:restaurar <archivo.dump>',
        );
      }

      restaurar(archivo, urlDe('RESTAURAR_DB_URL'));
      console.log('Restaurado. Apuntá DB_URL de la API a esa base.');
      break;
    }

    case 'probar':
      simulacro();
      break;

    default:
      throw new ErrorDeRespaldo(
        'Uso: respaldo.mts crear | restaurar <archivo> | probar',
      );
  }
}

try {
  main();
} catch (error) {
  if (error instanceof ErrorDeRespaldo) {
    console.error(`\n${error.message}`);
    process.exit(1);
  }

  throw error;
}
