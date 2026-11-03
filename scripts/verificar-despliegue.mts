/**
 * Verifica el hardening de un sistema desplegado: HTTPS, cabeceras, cookie de
 * sesión, CORS y errores. Es la parte automática de la fase 9 del plan de
 * testeo, y sirve igual para la preproducción local que para producción.
 *
 *   pnpm preprod:verificar
 *   pnpm exec tsx scripts/verificar-despliegue.mts --web https://app.ejemplo.uy --api https://app.ejemplo.uy/api
 *
 * Para probar la cookie hace falta una cuenta: VERIFICAR_EMAIL y
 * VERIFICAR_PASSWORD. Sin ellas, esos chequeos se saltean (y se avisa). En
 * producción, que sea una cuenta de prueba, nunca la de alguien.
 *
 * Solo hace pedidos de lectura y un login: no crea ni modifica datos.
 * Termina con código 1 si algún chequeo falla.
 */
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import type { TLSSocket } from 'node:tls';

type Respuesta = {
  status: number;
  headers: http.IncomingHttpHeaders;
  body: string;
  tls: string | null;
};

type Opciones = {
  web: string;
  api: string;
  webHttp: string;
  ca?: Buffer;
  email?: string;
  password?: string;
};

function leerOpciones(): Opciones {
  const args = process.argv.slice(2);
  const valor = (nombre: string) => {
    const i = args.indexOf(nombre);

    return i >= 0 ? args[i + 1] : undefined;
  };

  // La preproducción local (`pnpm preprod`): sus URL, el certificado de
  // Caddy y la cuenta de administración del seed, que solo existe ahí.
  if (args.includes('--preprod')) {
    return {
      web: 'https://ccisj.localhost:8443',
      api: 'https://ccisj.localhost:8443/api',
      webHttp: 'http://ccisj.localhost:8480',
      ca: certificadoDeCaddy(),
      email: process.env.VERIFICAR_EMAIL ?? 'admin@ccisj.uy',
      password: process.env.VERIFICAR_PASSWORD ?? '1234',
    };
  }

  const web = valor('--web');
  const api = valor('--api');

  if (!web || !api) {
    console.error(
      'Uso: --web <url> --api <url> [--web-http <url>] [--ca <archivo>]',
    );
    process.exit(2);
  }

  const ca = valor('--ca');
  const sinPuerto = new URL(web);

  sinPuerto.protocol = 'http:';
  sinPuerto.port = '';

  return {
    web,
    api,
    webHttp: valor('--web-http') ?? sinPuerto.origin,
    ca: ca ? readFileSync(ca) : undefined,
    email: process.env.VERIFICAR_EMAIL,
    password: process.env.VERIFICAR_PASSWORD,
  };
}

/** La raíz de la autoridad local de Caddy, leída del contenedor. */
function certificadoDeCaddy() {
  try {
    return execSync(
      'docker compose -f docker-compose.preprod.yml exec -T caddy cat /data/caddy/pki/authorities/local/root.crt',
      { stdio: ['ignore', 'pipe', 'ignore'] },
    );
  } catch {
    console.error(
      'No se pudo leer el certificado de Caddy: ¿está levantada la preproducción (pnpm preprod)?',
    );
    process.exit(2);
  }
}

function pedir(
  url: string,
  opciones: {
    metodo?: string;
    headers?: Record<string, string>;
    body?: string;
    ca?: Buffer;
  } = {},
): Promise<Respuesta> {
  const destino = new URL(url);
  const cliente = destino.protocol === 'https:' ? https : http;

  return new Promise((listo, fallo) => {
    const req = cliente.request(
      destino,
      {
        method: opciones.metodo ?? 'GET',
        headers: opciones.headers,
        ca: opciones.ca,
      },
      (res) => {
        let body = '';
        // Se lee ahora: al terminar la respuesta el socket ya se liberó.
        const tls =
          destino.protocol === 'https:'
            ? (res.socket as TLSSocket).getProtocol()
            : null;

        res.setEncoding('utf8');
        res.on('data', (parte: string) => (body += parte));
        res.on('end', () =>
          listo({
            status: res.statusCode ?? 0,
            headers: res.headers,
            body,
            tls,
          }),
        );
      },
    );

    req.on('error', fallo);
    if (opciones.body) req.write(opciones.body);
    req.end();
  });
}

type Resultado = { nombre: string; ok: boolean | null; detalle: string };

const resultados: Resultado[] = [];

function chequear(nombre: string, ok: boolean, detalle = '') {
  resultados.push({ nombre, ok, detalle });
}

function saltear(nombre: string, detalle: string) {
  resultados.push({ nombre, ok: null, detalle });
}

function cabecera(r: Respuesta, nombre: string) {
  const valor = r.headers[nombre.toLowerCase()];

  return Array.isArray(valor) ? valor.join(', ') : (valor ?? '');
}

const HSTS_MINIMO = 180 * 24 * 60 * 60;

function hstsSuficiente(r: Respuesta) {
  const edad = /max-age=(\d+)/.exec(cabecera(r, 'strict-transport-security'));

  return !!edad && Number(edad[1]) >= HSTS_MINIMO;
}

function sinVersion(r: Respuesta) {
  const servidor = cabecera(r, 'server');

  return !/\d/.test(servidor) && !cabecera(r, 'x-powered-by');
}

async function main() {
  const o = leerOpciones();
  const ca = o.ca;
  const origenWeb = new URL(o.web).origin;

  console.log(`Verificando ${o.web} (API: ${o.api})\n`);

  // --- HTTPS ---------------------------------------------------------------
  const web = await pedir(o.web, { ca });

  chequear(
    'HTTPS con TLS 1.2 o superior',
    web.tls === 'TLSv1.3' || web.tls === 'TLSv1.2',
    web.tls ?? 'sin TLS',
  );

  try {
    const porHttp = await pedir(`${o.webHttp}/socios`);
    const destino = cabecera(porHttp, 'location');

    chequear(
      'HTTP redirige a HTTPS',
      [301, 302, 307, 308].includes(porHttp.status) &&
        destino.startsWith('https://'),
      `${porHttp.status} → ${destino || '(sin Location)'}`,
    );
  } catch (error) {
    // Si HTTP ni siquiera contesta no hay riesgo, pero quien escriba la
    // dirección sin "https://" no llega: conviene la redirección.
    saltear('HTTP redirige a HTTPS', `no responde por HTTP (${String(error)})`);
  }

  // --- Cabeceras del frontend -------------------------------------------
  const csp = cabecera(web, 'content-security-policy');

  chequear(
    'Frontend: HSTS de 180 días o más',
    hstsSuficiente(web),
    cabecera(web, 'strict-transport-security'),
  );
  chequear(
    'Frontend: CSP sin unsafe-inline ni unsafe-eval',
    !!csp && !/unsafe-inline|unsafe-eval/.test(csp),
    csp || '(sin CSP)',
  );
  chequear(
    'Frontend: no se puede meter en un frame',
    /frame-ancestors 'none'/.test(csp) ||
      cabecera(web, 'x-frame-options') === 'DENY',
    cabecera(web, 'x-frame-options'),
  );
  chequear(
    'Frontend: nosniff',
    cabecera(web, 'x-content-type-options') === 'nosniff',
  );
  chequear(
    'Frontend: no muestra versiones',
    sinVersion(web),
    cabecera(web, 'server'),
  );

  const rutaInterna = await pedir(`${o.web}/socios/1`, { ca });

  chequear(
    'Frontend: una ruta de la app devuelve la app (no un 404)',
    rutaInterna.status === 200 && rutaInterna.body.includes('<div id="app">'),
    String(rutaInterna.status),
  );

  // --- Cabeceras de la API ------------------------------------------------
  const api = await pedir(`${o.api}/`, { ca });

  chequear(
    'API: HSTS de 180 días o más',
    hstsSuficiente(api),
    cabecera(api, 'strict-transport-security'),
  );
  chequear(
    "API: CSP default-src 'none'",
    /default-src 'none'/.test(cabecera(api, 'content-security-policy')),
  );
  chequear(
    'API: nosniff',
    cabecera(api, 'x-content-type-options') === 'nosniff',
  );
  chequear(
    'API: no muestra versiones ni X-Powered-By',
    sinVersion(api),
    cabecera(api, 'server'),
  );

  // --- CORS -----------------------------------------------------------------
  const ajeno = await pedir(`${o.api}/ofertas`, {
    ca,
    headers: { origin: 'https://sitio-ajeno.example' },
  });

  chequear(
    'CORS: un sitio ajeno no puede leer la API',
    !cabecera(ajeno, 'access-control-allow-origin'),
    cabecera(ajeno, 'access-control-allow-origin') ||
      'sin Access-Control-Allow-Origin',
  );

  const propio = await pedir(`${o.api}/ofertas`, {
    ca,
    headers: { origin: origenWeb },
  });

  chequear(
    'CORS: el frontend sí',
    cabecera(propio, 'access-control-allow-origin') === origenWeb,
    cabecera(propio, 'access-control-allow-origin'),
  );

  // --- Errores sin detalles internos --------------------------------------
  const inexistente = await pedir(`${o.api}/no-existe`, { ca });

  chequear(
    'API: una ruta inexistente es un 404 en JSON',
    inexistente.status === 404 &&
      cabecera(inexistente, 'content-type').includes('application/json'),
    String(inexistente.status),
  );

  const roto = await pedir(`${o.api}/auth/login`, {
    ca,
    metodo: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{"email":',
  });

  chequear(
    'API: un JSON roto no devuelve el stack trace',
    roto.status === 400 && !/at |node_modules|\.ts:|\.js:/.test(roto.body),
    `${roto.status} ${roto.body.slice(0, 60)}`,
  );

  const sinSesion = await pedir(`${o.api}/auth/me`, { ca });

  chequear(
    'API: sin sesión, 401',
    sinSesion.status === 401,
    String(sinSesion.status),
  );

  // --- Cookie de sesión -----------------------------------------------------
  if (!o.email || !o.password) {
    saltear('Cookie de sesión', 'falta VERIFICAR_EMAIL / VERIFICAR_PASSWORD');
  } else {
    const login = await pedir(`${o.api}/auth/login`, {
      ca,
      metodo: 'POST',
      headers: { 'content-type': 'application/json', origin: origenWeb },
      body: JSON.stringify({ email: o.email, password: o.password }),
    });
    const cookie = (login.headers['set-cookie'] ?? []).find((c) =>
      c.startsWith('token='),
    );

    if (login.status !== 200 || !cookie) {
      chequear(
        'Login de la cuenta de verificación',
        false,
        String(login.status),
      );
    } else {
      const atributos = cookie.split(';').map((a) => a.trim().toLowerCase());

      chequear('Cookie: Secure', atributos.includes('secure'));
      chequear('Cookie: HttpOnly', atributos.includes('httponly'));
      chequear(
        'Cookie: SameSite Lax o Strict',
        atributos.includes('samesite=lax') ||
          atributos.includes('samesite=strict'),
        atributos.find((a) => a.startsWith('samesite')) ?? '(sin SameSite)',
      );

      const token = cookie.split(';')[0];
      const me = await pedir(`${o.api}/auth/me`, {
        ca,
        headers: { cookie: token },
      });

      chequear(
        'La sesión funciona por HTTPS',
        me.status === 200,
        String(me.status),
      );

      await pedir(`${o.api}/auth/logout`, {
        ca,
        metodo: 'POST',
        headers: { cookie: token, origin: origenWeb },
      });
    }
  }

  // --- Resumen ----------------------------------------------------------------
  for (const r of resultados) {
    const marca = r.ok === null ? '–' : r.ok ? '✓' : '✗';

    console.log(`${marca} ${r.nombre}${r.detalle ? `  (${r.detalle})` : ''}`);
  }

  const fallos = resultados.filter((r) => r.ok === false).length;
  const salteados = resultados.filter((r) => r.ok === null).length;

  console.log(
    `\n${resultados.length - fallos - salteados} bien, ${fallos} mal, ${salteados} salteados.`,
  );
  process.exit(fallos > 0 ? 1 : 0);
}

await main();
