/**
 * Análisis dinámico de seguridad (DAST) de la API con OWASP ZAP.
 *
 *   pnpm dast          escaneo pasivo: ZAP recorre todos los endpoints y
 *                      revisa las respuestas, sin atacar. Unos minutos.
 *   pnpm dast:activo   además ataca cada parámetro (inyección SQL, XSS,
 *                      path traversal, etc.). Bastante más largo.
 *
 * Qué hace, en orden:
 *
 * 1. Rehace la base de pruebas de Docker, para escanear siempre sobre el
 *    mismo estado. NUNCA corre contra Supabase: arranca su propio servidor
 *    con `DB_URL` apuntando a la base local, y verifica el host antes.
 * 2. Arranca la API en el puerto 3101. En el pasivo, con `NODE_ENV=production`,
 *    para revisar las cabeceras y la cookie tal como saldrían en producción.
 *    En el activo, con `NODE_ENV=test`, que apaga los rate limits: con ellos
 *    ZAP recibiría 429 a partir del request 300 y no probaría nada. Delante,
 *    en el 3100, un proxy que cuenta las respuestas y anota cada error 5xx.
 * 3. Inicia sesión como el admin del seed y crea, por la misma API, un
 *    registro de cada cosa (socio, oferta, pago, movimiento de caja...). Sus
 *    IDs reemplazan los `x-fixture` de `dast/openapi.yaml`: así cada ataque
 *    llega a un recurso que existe, y no se queda en un 404.
 * 4. Corre ZAP en Docker con `dast/zap.yaml`, que importa la descripción
 *    OpenAPI, escanea y deja los reportes en `dast/salida/`.
 * 5. Apaga la API e imprime el resumen. Termina con error si hay algún
 *    hallazgo de riesgo alto o algún error 5xx.
 *
 * Después del activo la base queda con lo que creó ZAP. Para volver a correr
 * los tests: `pnpm test:db:down && pnpm test:db`.
 */
import { type ChildProcess, spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer, request } from 'node:http';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse, stringify } from 'yaml';

import { TEST_DB_URL } from './test-db-url.mjs';

const ACTIVO = process.argv.includes('--activo');
const MODO = ACTIVO ? 'activo' : 'pasivo';

// Versión fija y no `stable`: si ZAP cambia sus reglas, que sea porque se
// actualizó acá a propósito, y no porque dos corridas iguales bajaron
// imágenes distintas.
const IMAGEN_ZAP = 'ghcr.io/zaproxy/zaproxy:2.17.0';

const PUERTO_API = 3101;
const API = `http://localhost:${PUERTO_API}`;
// ZAP no habla con la API directo sino con un proxy que cuenta las
// respuestas (`arrancarContador`). Así ve ZAP la máquina desde su contenedor.
const PUERTO_CONTADOR = 3100;
const API_DESDE_ZAP = `http://host.docker.internal:${PUERTO_CONTADOR}`;

const RAIZ = fileURLToPath(new URL('..', import.meta.url));
const DAST = join(RAIZ, 'dast');
const SALIDA = join(DAST, 'salida');

/** Las cuentas del seed (`prisma/seed.ts`). Solo existen en la base local. */
const ADMIN = { email: 'admin@ccisj.uy', password: '1234' };
const POSTULANTE = { email: 'postulante@ccisj.uy', password: '1234' };

function abortar(mensaje: string): never {
  console.error(`\n${mensaje}\n`);
  process.exit(1);
}

function correr(etiqueta: string, comando: string) {
  console.log(`\n→ ${etiqueta}`);

  // Una sola cadena con `shell: true`, por lo mismo que en `test-db.mts`: en
  // Windows `pnpm` es un `.cmd`. Los comandos son constantes de este archivo.
  const resultado = spawnSync(comando, { stdio: 'inherit', shell: true });

  if (resultado.status !== 0) abortar(`Falló: ${etiqueta}`);
}

// --- 1. La base -------------------------------------------------------------

function verificarBaseLocal() {
  const host = new URL(TEST_DB_URL).hostname;

  // Un escaneo activo manda miles de requests que crean, editan y borran.
  if (!['localhost', '127.0.0.1', '::1'].includes(host)) {
    abortar(
      `El escaneo se niega a correr contra "${host}": solo contra la base local de docker-compose.test.yml.`,
    );
  }
}

// --- 2. La API --------------------------------------------------------------

function arrancarApi(): ChildProcess {
  console.log(`\n→ API en ${API} (NODE_ENV=${ACTIVO ? 'test' : 'production'})`);

  const api = spawn(process.execPath, ['--import', 'tsx', 'src/server.ts'], {
    cwd: RAIZ,
    stdio: ['ignore', 'inherit', 'inherit'],
    env: {
      ...process.env,
      NODE_ENV: ACTIVO ? 'test' : 'production',
      PORT: String(PUERTO_API),
      DB_URL: TEST_DB_URL,
      // Un secreto nuevo en cada corrida: el del `.env` de cada uno no tiene
      // por qué pasar por acá.
      JWT_SECRET: randomBytes(48).toString('hex'),
      CORS_ORIGIN: '',
      // Vacías a propósito: `dotenv` no pisa una variable que ya existe, así
      // que esto gana sobre el `.env`. Si alguien tiene ahí las claves de
      // Storage, el escaneo subiría archivos de prueba al Storage real.
      SUPABASE_URL: '',
      SUPABASE_SERVICE_ROLE_KEY: '',
    },
  });

  api.on('exit', (codigo) => {
    if (codigo !== null && codigo !== 0) abortar('La API se cerró sola.');
  });

  return api;
}

async function esperarApi() {
  for (let intento = 0; intento < 60; intento++) {
    try {
      const respuesta = await fetch(API);
      if (respuesta.ok) return;
    } catch {
      // Todavía no escucha.
    }

    await new Promise((listo) => setTimeout(listo, 500));
  }

  abortar('La API no respondió en 30 segundos.');
}

/**
 * Proxy entre ZAP y la API que cuenta las respuestas por código y anota cada
 * error 5xx con el request que lo provocó.
 *
 * Existe porque un 500 es la señal más útil de un escaneo activo: un dato que
 * el código no esperaba y no supo rechazar. ZAP no la reporta como hallazgo
 * (los errores de esta API no muestran nada interno, que es lo que él busca),
 * y la API corre con `NODE_ENV=test`, que apaga su log de requests y el de
 * errores. Mirarlo desde afuera además no obliga a tocar la aplicación.
 */
function arrancarContador() {
  const porCodigo = new Map<number, number>();
  const errores: string[] = [];

  const servidor = createServer((pedido, respuesta) => {
    const partes: Buffer[] = [];

    pedido.on('data', (parte: Buffer) => partes.push(parte));
    pedido.on('end', () => {
      const cuerpo = Buffer.concat(partes);

      const reenvio = request(
        {
          host: 'localhost',
          port: PUERTO_API,
          method: pedido.method,
          path: pedido.url,
          headers: pedido.headers,
        },
        (deLaApi) => {
          const codigo = deLaApi.statusCode ?? 0;
          porCodigo.set(codigo, (porCodigo.get(codigo) ?? 0) + 1);

          if (codigo >= 500) {
            errores.push(
              `${codigo} ${pedido.method} ${pedido.url}\n    ${cuerpo.toString('utf8', 0, 500)}`,
            );
          }

          respuesta.writeHead(codigo, deLaApi.headers);
          deLaApi.pipe(respuesta);
        },
      );

      reenvio.on('error', () => {
        respuesta.writeHead(502).end();
      });
      reenvio.end(cuerpo);
    });
  });

  servidor.listen(PUERTO_CONTADOR);

  return { servidor, porCodigo, errores };
}

// --- 3. Los datos de prueba -------------------------------------------------

async function iniciarSesion(cuenta: { email: string; password: string }) {
  const respuesta = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cuenta),
  });

  const cookie = respuesta.headers
    .getSetCookie()
    .find((valor) => valor.startsWith('token='));

  if (!respuesta.ok || !cookie) {
    abortar(
      `No se pudo iniciar sesión como ${cuenta.email} (${respuesta.status}).`,
    );
  }

  const { user } = (await respuesta.json()) as { user: { id: number } };

  return { cookie: cookie.split(';')[0], id: user.id };
}

function cliente(cookie: string) {
  return async function pedir<T = Record<string, unknown>>(
    metodo: string,
    ruta: string,
    body?: unknown,
  ): Promise<T> {
    const respuesta = await fetch(`${API}${ruta}`, {
      method: metodo,
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    const datos = await respuesta.json();

    if (!respuesta.ok) {
      abortar(
        `No se pudo preparar el escaneo: ${metodo} ${ruta} respondió ${respuesta.status} (${JSON.stringify(datos)}).`,
      );
    }

    return datos as T;
  };
}

type Fixtures = Record<string, number>;
type Pedir = ReturnType<typeof cliente>;

/**
 * Un registro de cada recurso que tiene un `x-fixture` en la descripción,
 * creado por la API y no directo en la base: así los datos son exactamente
 * los que crearía un usuario, y de paso es una prueba de humo.
 */
async function crearJuego(admin: Pedir, postulante: Pedir, n: number) {
  const sufijo = `${Date.now()}-${n}`;

  const usuario = await admin('POST', '/usuarios', {
    email: `dast-usuario-${sufijo}@ccisj.uy`,
    password: 'ClaveDeEjemplo1',
    tipo: 'POSTULANTE',
  });

  const { socioId } = await admin<{ socioId: number }>('POST', '/socios', {
    razonSocial: `Empresa DAST ${sufijo}`,
    titular: 'Titular DAST',
    giroComercial: 'Comercio',
    tipo: 'COMUN',
    rut: `DAST-${sufijo}`,
    numeroBps: `${n}${String(Date.now()).slice(-6)}`,
    fechaInicioEmpresa: '2020-01-15',
    fechaAfiliacion: '2026-01-01',
    direccion: '25 de Mayo 123',
    ciudad: 'San José',
    celular: '099123456',
    telefono: '43421234',
    email: `dast-socio-${sufijo}@ccisj.uy`,
  });

  const categoria = await admin('POST', '/categorias', {
    nombre: `Categoría DAST ${sufijo}`,
  });

  const oferta = await admin('POST', '/ofertas', {
    socioId,
    titulo: 'Oferta DAST',
    descripcion: 'Oferta creada para el escaneo',
    categoriaIds: [categoria.id],
  });

  // La postulación la crea el postulante del seed, que ya tiene un CV.
  const postulacion = await postulante('POST', '/postulaciones', {
    ofertaId: oferta.id,
  });

  const notificacion = await admin('POST', '/notificaciones', {
    titulo: 'Notificación DAST',
    mensaje: 'Creada para el escaneo',
    tipo: 'EMERGENTE',
    destinatarioTipo: 'TODOS',
  });

  // Futura: solo esas se pueden editar, y con la vigente el PATCH respondería
  // 400 a todo sin llegar a guardar nada.
  const configuracion = await admin('POST', '/cuotas/configuracion', {
    importeBase: 1500,
    vigenciaDesde: `209${n}-01-01`,
  });

  await admin('POST', `/cuotas/socio/${socioId}`, { year: 2026, month: 1 });

  const pago = await admin('POST', `/cuotas/socio/${socioId}/pagos`, {
    importe: 100,
    fechaPago: '2026-01-10',
    medioPago: 'EFECTIVO',
  });

  const ajuste = await admin('POST', `/cuotas/socio/${socioId}/ajustes`, {
    tipo: 'DESCUENTO',
    importe: 50,
    fechaDesde: '2026-02-01',
  });

  const cajaCategoria = await admin('POST', '/caja/categorias', {
    nombre: `Caja DAST ${sufijo}`,
    tipo: 'INGRESO',
  });

  const movimiento = await admin('POST', '/caja/movimientos', {
    tipo: 'INGRESO',
    categoriaId: cajaCategoria.id,
    concepto: 'Movimiento DAST',
    importe: 500,
    fecha: '2026-01-10',
  });

  // Un perfil de postulante propio, en una cuenta aparte.
  const cuentaPostulante = await admin('POST', '/usuarios', {
    email: `dast-postulante-${sufijo}@ccisj.uy`,
    password: 'ClaveDeEjemplo1',
    tipo: 'POSTULANTE',
  });
  const perfil = await admin('POST', '/postulantes', {
    usuarioId: cuentaPostulante.id,
    nombre: 'Postulante',
    apellido: 'DAST',
  });

  const juego: Fixtures = {
    usuario: Number(usuario.id),
    socio: socioId,
    postulante: Number(perfil.id),
    categoria: Number(categoria.id),
    oferta: Number(oferta.id),
    postulacion: Number(postulacion.id),
    notificacion: Number(notificacion.id),
    configuracion: Number(configuracion.id),
    pago: Number(pago.id),
    ajuste: Number(ajuste.id),
    cajaCategoria: Number(cajaCategoria.id),
    movimiento: Number(movimiento.id),
  };

  const faltan = Object.entries(juego).filter(
    ([, id]) => !Number.isInteger(id),
  );

  if (faltan.length) {
    abortar(
      `No se obtuvo el ID de: ${faltan.map(([nombre]) => nombre).join(', ')}.`,
    );
  }

  return juego;
}

/**
 * Dos juegos de datos: uno para todo, y otro solo para los DELETE. ZAP manda
 * el DELETE de una ruta antes que su PATCH, así que con un solo juego cada
 * PATCH caía sobre un registro ya borrado y respondía 404: el ataque nunca
 * llegaba a la validación ni a la base.
 */
async function crearFixtures(cookieAdmin: string) {
  console.log('\n→ Datos de prueba para el escaneo');

  const admin = cliente(cookieAdmin);
  const postulante = cliente((await iniciarSesion(POSTULANTE)).cookie);

  const principal = await crearJuego(admin, postulante, 1);
  const paraBorrar = await crearJuego(admin, postulante, 2);

  console.log({ principal, paraBorrar });

  return { principal, paraBorrar };
}

/**
 * Lo que hay que cambiarle a la descripción para que ZAP mande los datos de
 * ejemplo tal cual. Medido con un servidor que solo registraba lo que
 * llegaba: con `format: date` ZAP manda la fecha como "Thu Oct 01 00:00:00
 * UTC 2026", con un `enum` manda el primer valor y no el del ejemplo, y los
 * acentos le llegan a la API en otra codificación. Todo eso hacía que el
 * ataque se quedara en la primera validación. El `format: binary` se deja:
 * es el que le dice que mande un archivo.
 *
 * Los campos `email` y `password` son otro caso: ahí el valor lo pone el
 * complemento Form Handler de ZAP, y se apaga en `correrZap`.
 */
function paraZap(objeto: Record<string, unknown>) {
  if (typeof objeto.format === 'string' && objeto.format !== 'binary') {
    delete objeto.format;
  }

  if (typeof objeto.example === 'string') {
    objeto.example = objeto.example.normalize('NFD').replace(/\p{M}/gu, '');
  }

  if (Array.isArray(objeto.enum) && objeto.example !== undefined) {
    objeto.enum = [
      objeto.example,
      ...objeto.enum.filter((valor) => valor !== objeto.example),
    ];
  }
}

const METODOS = ['get', 'post', 'put', 'patch', 'delete'] as const;

type Parametro = { $ref?: string };
type Operacion = { parameters?: Parametro[] };
type RutaDescrita = Partial<Record<(typeof METODOS)[number], Operacion>> & {
  parameters?: Parametro[];
};

/**
 * Copia de la descripción para ZAP, con los IDs reales en lugar de los de
 * ejemplo. Un `x-fixture` puede estar en un parámetro (el `example` va en su
 * `schema`) o en el esquema de un campo.
 */
function descripcionConFixtures(fixtures: {
  principal: Fixtures;
  paraBorrar: Fixtures;
}) {
  const spec = parse(readFileSync(join(DAST, 'openapi.yaml'), 'utf8'));
  const usados = new Set<string>();

  function recorrer(nodo: unknown, juego: Fixtures) {
    if (Array.isArray(nodo)) return nodo.forEach((n) => recorrer(n, juego));
    if (typeof nodo !== 'object' || nodo === null) return;

    const objeto = nodo as Record<string, unknown>;
    const nombre = objeto['x-fixture'];

    if (typeof nombre === 'string') {
      if (!(nombre in juego)) abortar(`x-fixture desconocido: "${nombre}".`);

      const destino = (objeto.schema ?? objeto) as Record<string, unknown>;
      destino.example = juego[nombre];
      usados.add(nombre);
    }

    paraZap(objeto);
    Object.values(objeto).forEach((n) => recorrer(n, juego));
  }

  // Los parámetros de cada ruta pasan a cada una de sus operaciones, con una
  // copia propia. Hace falta para que el DELETE tenga sus IDs: OpenAPI deja
  // que una operación reemplace un parámetro de la ruta, pero ZAP lo ignora
  // y usa siempre el de la ruta (medido).
  const componentes = spec.components.parameters as Record<string, Parametro>;

  for (const ruta of Object.values(spec.paths) as RutaDescrita[]) {
    if (!ruta.parameters) continue;

    const deLaRuta = ruta.parameters.map((p) =>
      p.$ref ? componentes[p.$ref.split('/').pop()!] : p,
    );

    for (const metodo of METODOS) {
      const operacion = ruta[metodo];
      if (!operacion) continue;

      operacion.parameters = [
        ...structuredClone(deLaRuta),
        ...(operacion.parameters ?? []),
      ];
    }

    delete ruta.parameters;
  }

  recorrer(spec, fixtures.principal);

  for (const ruta of Object.values(spec.paths) as RutaDescrita[]) {
    if (ruta.delete) recorrer(ruta.delete.parameters, fixtures.paraBorrar);
  }

  const sinUsar = Object.keys(fixtures.principal).filter(
    (nombre) => !usados.has(nombre),
  );
  if (sinUsar.length) abortar(`Fixtures que nadie usa: ${sinUsar.join(', ')}.`);

  spec.servers = [{ url: API_DESDE_ZAP }];

  writeFileSync(join(SALIDA, 'openapi.json'), JSON.stringify(spec, null, 2));
}

/** El plan de ZAP del modo elegido: el pasivo es el mismo sin el ataque. */
function planDelModo() {
  const plan = parse(readFileSync(join(DAST, 'zap.yaml'), 'utf8'));

  if (!ACTIVO) {
    plan.jobs = plan.jobs.filter(
      (job: { type: string }) => job.type !== 'activeScan',
    );
  }

  for (const job of plan.jobs) {
    if (job.type === 'report') {
      job.parameters.reportFile = `${MODO}-${job.parameters.reportFile}`;
    }
  }

  writeFileSync(join(SALIDA, 'zap.yaml'), stringify(plan));
}

// --- 4. ZAP -----------------------------------------------------------------

function correrZap(cookie: string): Promise<number> {
  console.log(`\n→ ZAP (${MODO})`);

  // `ZAP_AUTH_HEADER*` son de ZAP: agregan esa cabecera a cada request. La
  // cookie va por acá y no escrita en el plan, que queda en `dast/salida/`.
  //
  // `spawn` y no `spawnSync`: el proxy contador vive en este mismo proceso, y
  // con el proceso bloqueado esperando a Docker no atendería ningún request.
  const zap = spawn(
    'docker',
    [
      'run',
      '--rm',
      '--add-host=host.docker.internal:host-gateway',
      '-v',
      `${SALIDA}:/zap/wrk:rw`,
      '-e',
      'ZAP_AUTH_HEADER=Cookie',
      '-e',
      `ZAP_AUTH_HEADER_VALUE=${cookie}`,
      '-e',
      `ZAP_API=${API_DESDE_ZAP}`,
      IMAGEN_ZAP,
      'zap.sh',
      '-cmd',
      // El complemento Form Handler le pone a todo campo `email` el valor
      // "zaproxy@example.com" y a todo `password` "ZAP", sin mirar el
      // ejemplo: el registro y el alta de usuarios respondían 400 por la
      // política de contraseñas, y ningún otro campo de esos endpoints
      // llegaba a atacarse. Con esas dos reglas apagadas, usa los ejemplos.
      ...['email', 'password'].flatMap((campo, i) => [
        '-config',
        `formhandler.fields.field(${i}).fieldId=${campo}`,
        '-config',
        `formhandler.fields.field(${i}).value=`,
        '-config',
        `formhandler.fields.field(${i}).enabled=false`,
      ]),
      '-autorun',
      '/zap/wrk/zap.yaml',
    ],
    { stdio: 'inherit' },
  );

  return new Promise((listo) => {
    zap.on('error', (error) =>
      abortar(`No se pudo correr Docker: ${error.message}`),
    );
    zap.on('exit', (codigo) => listo(codigo ?? 1));
  });
}

// --- 5. Resumen -------------------------------------------------------------

type Alerta = {
  name: string;
  riskcode: string;
  count: string;
  pluginid: string;
};

function resumir() {
  const reporte = JSON.parse(
    readFileSync(join(SALIDA, `${MODO}-reporte.json`), 'utf8'),
  ) as { site: { alerts: Alerta[] }[] };

  const alertas = reporte.site.flatMap((sitio) => sitio.alerts);
  // -1 es lo que `alertFilter` (en `zap.yaml`) marcó como falso positivo.
  const riesgos: Record<string, string> = {
    '-1': 'Falso positivo',
    0: 'Informativo',
    1: 'Bajo',
    2: 'Medio',
    3: 'Alto',
  };

  console.log(`\nHallazgos (${MODO}):`);

  for (const alerta of alertas.sort(
    (a, b) => Number(b.riskcode) - Number(a.riskcode),
  )) {
    console.log(
      `  [${riesgos[alerta.riskcode]}] ${alerta.name} (regla ${alerta.pluginid}, ${alerta.count} instancias)`,
    );
  }

  if (!alertas.length) console.log('  ninguno');

  console.log(`\nReporte completo: dast/salida/${MODO}-reporte.html`);

  return alertas.some((alerta) => alerta.riskcode === '3');
}

function resumirRespuestas(contador: ReturnType<typeof arrancarContador>) {
  const codigos = [...contador.porCodigo].sort(([a], [b]) => a - b);
  const total = codigos.reduce((suma, [, cantidad]) => suma + cantidad, 0);

  console.log(`\nRespuestas de la API a ZAP (${total} requests):`);

  for (const [codigo, cantidad] of codigos) {
    console.log(`  ${codigo}: ${cantidad}`);
  }

  const archivo = join(SALIDA, `${MODO}-errores-5xx.txt`);
  writeFileSync(archivo, contador.errores.join('\n') + '\n');

  console.log(
    contador.errores.length
      ? `\n${contador.errores.length} errores 5xx, con su request: dast/salida/${MODO}-errores-5xx.txt`
      : '\nNingún error 5xx.',
  );

  return contador.errores.length > 0;
}

// --- Principal --------------------------------------------------------------

verificarBaseLocal();
mkdirSync(SALIDA, { recursive: true });

correr('Base de pruebas desde cero', 'pnpm test:db:down && pnpm test:db');

const api = arrancarApi();
const contador = arrancarContador();

try {
  await esperarApi();

  const sesion = await iniciarSesion(ADMIN);
  const fixtures = await crearFixtures(sesion.cookie);

  descripcionConFixtures(fixtures);
  planDelModo();

  const codigoZap = await correrZap(sesion.cookie);
  const hayAltos = resumir();
  const hay5xx = resumirRespuestas(contador);

  if (ACTIVO) {
    console.log(
      '\nLa base quedó con lo que creó ZAP. Para los tests: pnpm test:db:down && pnpm test:db',
    );
  }

  // ZAP termina con 1 si el plan tuvo errores y con 2 si solo hubo avisos.
  process.exitCode = hayAltos || hay5xx || codigoZap === 1 ? 1 : 0;
} finally {
  contador.servidor.closeAllConnections();
  contador.servidor.close();
  api.removeAllListeners('exit');
  api.kill();
}
