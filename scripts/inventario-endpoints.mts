/**
 * Inventario de endpoints, extraído de la aplicación Express ya montada.
 *
 * Se corre con `pnpm inventario`. Sirve para dos cosas:
 *
 * 1. Saber qué endpoints existen de verdad, sin leer once archivos de rutas a
 *    mano y sin que se escape ninguno.
 * 2. Ver de un vistazo qué middlewares protegen cada uno.
 *
 * ADVERTENCIA IMPORTANTE, aprendida en carne propia: esta lista dice qué
 * middlewares hay, NO si el endpoint está bien protegido. Hay permisos que se
 * verifican más adentro (en el service), y hubo un caso en que el inventario
 * parecía mostrar `/usuarios` sin control de rol cuando en realidad sí lo
 * tiene. Quien manda es `tests/matriz-autorizacion.test.ts`, que lo comprueba
 * mandando requests de verdad con cada rol.
 */
import mod from '../src/app.js';

type Matcher = (input: string) => unknown;

type Capa = {
  name?: string;
  matchers?: Matcher[];
  route?: { path: string; stack: { method?: string; name?: string }[] };
  handle?: { stack?: Capa[] };
};

/**
 * Los prefijos con los que `app.ts` monta cada router. Express 5 no expone la
 * ruta de montaje en la capa, así que no se puede leer: se declara acá y se
 * verifica preguntándole al matcher de cada capa cuál acepta. Si alguien monta
 * un módulo nuevo y no lo agrega, el script corta.
 */
const MONTAJES = [
  '/usuarios',
  '/socios',
  '/postulantes',
  '/categorias',
  '/ofertas',
  '/postulaciones',
  '/notificaciones',
  '/auth',
  '/cuotas',
  '/caja/categorias',
  '/caja/movimientos',
];

/** Middlewares de infraestructura: no dicen nada sobre permisos. */
const RUIDO = new Set([
  'helmetMiddleware',
  'jsonParser',
  'cookieParser',
  'logger',
  'corsMiddleware',
]);

export type Endpoint = {
  metodo: string;
  ruta: string;
  cadena: string[];
};

export function inventariar(): Endpoint[] {
  // `src/app.ts` es CommonJS y este archivo es ESM: la interoperabilidad deja
  // la app en `.default`.
  const app = ((mod as unknown as Record<string, unknown>).default ??
    mod) as Record<string, unknown>;

  const router = app.router as unknown as { stack: Capa[] };
  const endpoints: Endpoint[] = [];
  const usados = new Set<string>();

  function recorrer(capas: Capa[], prefijo: string, heredado: string[]) {
    // Copia propia: un `router.use(...)` vale para las rutas que vienen
    // después, no para las de antes ni para las de otro router.
    const previos = [...heredado];

    for (const capa of capas) {
      if (capa.route) {
        const metodos = new Set(
          capa.route.stack.map((s) => s.method).filter(Boolean) as string[],
        );

        for (const metodo of metodos) {
          endpoints.push({
            metodo: metodo.toUpperCase(),
            ruta: (prefijo + capa.route.path).replace(/(.)\/$/, '$1'),
            cadena: [
              ...previos,
              ...capa.route.stack.map((s) => s.name || '<anónima>'),
            ].filter((nombre) => !RUIDO.has(nombre)),
          });
        }

        continue;
      }

      if (capa.handle?.stack) {
        const aceptados = MONTAJES.filter((montaje) =>
          capa.matchers?.some((coincide) => coincide(montaje) !== false),
        );

        if (aceptados.length !== 1) {
          throw new Error(
            `No se pudo identificar el montaje de un router (candidatos: ` +
              `${aceptados.join(', ') || 'ninguno'}). Si se agregó un módulo ` +
              `en app.ts, hay que sumarlo a MONTAJES en este archivo.`,
          );
        }

        usados.add(aceptados[0]);
        recorrer(capa.handle.stack, prefijo + aceptados[0], previos);
        continue;
      }

      // Middleware suelto (`use`). Las anónimas se conservan a propósito: una
      // función devuelta por otra puede no tener nombre, y descartarlas fue
      // exactamente el error que hizo creer que `/usuarios` estaba sin
      // protección.
      if (capa.name !== 'handle' && !RUIDO.has(capa.name ?? '')) {
        previos.push(capa.name || '<anónima>');
      }
    }
  }

  recorrer(router.stack, '', []);

  const sinUsar = MONTAJES.filter((montaje) => !usados.has(montaje));

  if (sinUsar.length) {
    throw new Error(
      `Montajes declarados que no existen en la app: ${sinUsar.join(', ')}.`,
    );
  }

  return endpoints;
}

// Solo imprime si se lo corre directamente, para poder importarlo desde los
// tests sin que escupa la tabla.
if (process.argv[1]?.includes('inventario-endpoints')) {
  const endpoints = inventariar();

  console.log(`${endpoints.length} endpoints\n`);

  for (const { metodo, ruta, cadena } of endpoints) {
    console.log(`${metodo.padEnd(6)} ${ruta.padEnd(36)} ${cadena.join(' > ')}`);
  }
}
