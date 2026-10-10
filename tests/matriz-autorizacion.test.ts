/**
 * Matriz de autorización: quién puede llegar a cada endpoint.
 *
 * Cómo funciona: la lista de endpoints NO está escrita acá, se extrae de la
 * aplicación Express ya montada (`scripts/inventario-endpoints.mts`). Lo único
 * que se declara a mano es, para cada endpoint, qué actores deben pasar el
 * control de acceso. Consecuencia buscada: si alguien agrega una ruta y no
 * declara sus permisos, **este test falla**. No se puede sumar un endpoint sin
 * decidir quién puede usarlo.
 *
 * Qué se considera "pasar el control": que la respuesta NO sea 401 ni 403. Las
 * pruebas usan un ID que no existe y un body vacío, así que a quien pasa el
 * control le contesta 404 o 400. No hace falta que la operación tenga éxito, y
 * de paso no se crea ni se borra nada.
 *
 * OJO con los endpoints que llevan `:socioId`: como el ID no es de nadie, lo
 * que la matriz responde es "quién entra a los datos de un socio que no es el
 * suyo". Que un socio vea los propios se prueba en los tests de su módulo, y
 * los accesos cruzados con recursos reales están en
 * `tests/acceso-indebido.test.ts`.
 */
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { inventariar } from '../scripts/inventario-endpoints.mjs';
import app from '../src/app';
import {
  createAdmin,
  createApplicant,
  createMember,
  deleteUsers,
} from './session';

type Actor = 'anon' | 'post' | 'socio' | 'direc' | 'admin';

const TODOS: Actor[] = ['anon', 'post', 'socio', 'direc', 'admin'];
const AUTENTICADOS: Actor[] = ['post', 'socio', 'direc', 'admin'];
const SOCIOS: Actor[] = ['socio', 'direc'];
const SOLO_ADMIN: Actor[] = ['admin'];

/** Un ID con formato válido que no le pertenece a nadie. */
const ID_FANTASMA = '999999999';

const ESPERADO: Record<string, Actor[]> = {
  // Cuentas de usuario: solo la administración.
  'GET /usuarios': SOLO_ADMIN,
  'GET /usuarios/destinatarios-notificaciones': SOLO_ADMIN,
  'GET /usuarios/:id': SOLO_ADMIN,
  'POST /usuarios': SOLO_ADMIN,
  'PATCH /usuarios/:id': SOLO_ADMIN,
  'DELETE /usuarios/:id': SOLO_ADMIN,

  // El socio administra su propia empresa; el padrón lo ven la administración
  // y los socios directivos.
  'GET /socios/me': SOCIOS,
  'PATCH /socios/me': SOCIOS,
  'GET /socios': ['direc', 'admin'],
  'GET /socios/:id': ['direc', 'admin'],
  'POST /socios': SOLO_ADMIN,
  'PATCH /socios/:id': SOLO_ADMIN,
  'DELETE /socios/:id': SOLO_ADMIN,

  // El postulante entra a su propio perfil. Que sea el suyo y no el de otro lo
  // verifica el service: ver acceso-indebido.test.ts.
  'GET /postulantes': SOLO_ADMIN,
  'GET /postulantes/:id': ['post', 'admin'],
  'POST /postulantes': SOLO_ADMIN,
  'PATCH /postulantes/:id': ['post', 'admin'],
  'DELETE /postulantes/:id': SOLO_ADMIN,

  // Las categorías de las ofertas las lee cualquiera con sesión; las edita la
  // administración.
  'GET /categorias': AUTENTICADOS,
  'GET /categorias/:id': AUTENTICADOS,
  'POST /categorias': SOLO_ADMIN,
  'PATCH /categorias/:id': SOLO_ADMIN,
  'DELETE /categorias/:id': SOLO_ADMIN,

  // La bolsa de trabajo es pública: lo definió el cliente.
  'GET /ofertas': TODOS,
  'GET /ofertas/:id': TODOS,
  'GET /ofertas/mias': SOCIOS,
  'GET /ofertas/mias/:id': SOCIOS,
  'POST /ofertas': ['socio', 'direc', 'admin'],
  'PATCH /ofertas/:id': ['socio', 'direc', 'admin'],
  'DELETE /ofertas/:id': ['socio', 'direc', 'admin'],

  'GET /postulaciones': SOLO_ADMIN,
  'GET /postulaciones/recibidas': SOCIOS,
  'GET /postulaciones/recibidas/:id': SOCIOS,
  'GET /postulaciones/:id': AUTENTICADOS,
  'POST /postulaciones': ['post'],
  'PATCH /postulaciones/:id': ['socio', 'direc', 'admin'],
  'DELETE /postulaciones/:id': ['post', 'admin'],

  // Cada uno ve y marca las suyas. El listado completo es de la
  // administración, que además es la única que las crea.
  'GET /notificaciones': SOLO_ADMIN,
  'POST /notificaciones': SOLO_ADMIN,
  'GET /notificaciones/recibidas': AUTENTICADOS,
  'GET /notificaciones/emergentes': AUTENTICADOS,
  'PATCH /notificaciones/:id/leida': AUTENTICADOS,
  'PATCH /notificaciones/:id/emergente-vista': AUTENTICADOS,

  // Entrar y registrarse se hacen sin sesión, por definición.
  'POST /auth/login': TODOS,
  'POST /auth/registro': TODOS,
  'POST /auth/logout': TODOS,
  'GET /auth/me': AUTENTICADOS,
  'POST /auth/cambiar-contrasena': AUTENTICADOS,

  // Cuotas y pagos
  'GET /cuotas/resumen': SOLO_ADMIN,
  // H-01, corregido: antes las dos lecturas de la configuración las hacía
  // cualquiera con sesión, incluido un postulante.
  'GET /cuotas/configuracion': SOLO_ADMIN,
  'GET /cuotas/configuracion/historial': SOLO_ADMIN,
  'POST /cuotas/configuracion': SOLO_ADMIN,
  'PATCH /cuotas/configuracion/:id': SOLO_ADMIN,
  'GET /cuotas/pagos/recientes': SOLO_ADMIN,
  'POST /cuotas/socio/:socioId': SOLO_ADMIN,
  'POST /cuotas/socio/:socioId/ajustes': SOLO_ADMIN,
  'POST /cuotas/generar': SOLO_ADMIN,
  'POST /cuotas/socio/:socioId/pagos': SOLO_ADMIN,
  'PATCH /cuotas/:pagoId/anular': SOLO_ADMIN,
  'DELETE /cuotas/ajustes/:adjustmentId': SOLO_ADMIN,

  // HALLAZGO ABIERTO (H-02): `requireMemberAccess` deja pasar a CUALQUIER socio
  // directivo a los datos de CUALQUIER socio, no solo a los suyos. Se afirma el
  // comportamiento de HOY, no el deseado, para que el test avise el día que se
  // corrija.
  'GET /cuotas/socio/:socioId': ['direc', 'admin'],
  'GET /cuotas/socio/:socioId/ajustes': ['direc', 'admin'],
  'GET /cuotas/socio/:socioId/pagos': ['direc', 'admin'],
  'GET /cuotas/socio/:socioId/estado': ['direc', 'admin'],

  // Caja (módulo de otro integrante): todo de la administración.
  'GET /caja/categorias': SOLO_ADMIN,
  'POST /caja/categorias': SOLO_ADMIN,
  'DELETE /caja/categorias/:id': SOLO_ADMIN,
  'GET /caja/movimientos': SOLO_ADMIN,
  'POST /caja/movimientos': SOLO_ADMIN,
  'GET /caja/movimientos/resumen': SOLO_ADMIN,
  'PATCH /caja/movimientos/:id/anular': SOLO_ADMIN,

  // El cartel de la API.
  'GET /': TODOS,
};

const endpoints = inventariar();

function clave(metodo: string, ruta: string) {
  return `${metodo} ${ruta}`;
}

const creados: number[] = [];
const cookies = {} as Record<Exclude<Actor, 'anon'>, string[]>;

beforeAll(async () => {
  const [postulante, socio, directivo, admin] = await Promise.all([
    createApplicant(),
    createMember('COMUN'),
    createMember('DIRECTIVO'),
    createAdmin(),
  ]);

  creados.push(postulante.userId, socio.userId, directivo.userId, admin.userId);

  cookies.post = postulante.cookie;
  cookies.socio = socio.cookie;
  cookies.direc = directivo.cookie;
  cookies.admin = admin.cookie;
}, 60_000);

afterAll(async () => {
  await deleteUsers(creados);
});

describe('matriz de autorización', () => {
  it('todo endpoint de la app está declarado en la matriz', () => {
    const sinDeclarar = endpoints
      .map((endpoint) => clave(endpoint.metodo, endpoint.ruta))
      .filter((k) => !(k in ESPERADO));

    expect(
      sinDeclarar,
      'Hay endpoints sin permisos declarados: agregalos a ESPERADO, en este archivo. Decidir quién puede usar una ruta es parte de escribirla.',
    ).toEqual([]);
  });

  it('la matriz no declara endpoints que ya no existen', () => {
    const existentes = new Set(
      endpoints.map((endpoint) => clave(endpoint.metodo, endpoint.ruta)),
    );

    const sobrantes = Object.keys(ESPERADO).filter((k) => !existentes.has(k));

    expect(
      sobrantes,
      'La matriz declara rutas que la app ya no tiene. Si se renombraron o se borraron, hay que sacarlas de acá.',
    ).toEqual([]);
  });

  for (const endpoint of endpoints) {
    const k = clave(endpoint.metodo, endpoint.ruta);
    const permitidos = ESPERADO[k];

    it(`${k} — pasan: ${permitidos?.join(', ') ?? 'SIN DECLARAR'}`, async () => {
      // Si no está declarado ya lo reporta el primer test; acá no hay nada que
      // comprobar.
      if (!permitidos) return;

      const ruta = endpoint.ruta.replace(/:[A-Za-z]+/g, ID_FANTASMA);
      const metodo = endpoint.metodo.toLowerCase() as
        'get' | 'post' | 'patch' | 'delete';

      for (const actor of TODOS) {
        let peticion = request(app)[metodo](ruta);

        if (actor !== 'anon') {
          peticion = peticion.set('Cookie', cookies[actor]);
        }

        if (metodo === 'post' || metodo === 'patch') {
          peticion = peticion.send({});
        }

        const respuesta = await peticion;
        const bloqueado = respuesta.status === 401 || respuesta.status === 403;
        const deberiaPasar = permitidos.includes(actor);

        expect(
          !bloqueado,
          `"${actor}" ${deberiaPasar ? 'debería pasar' : 'NO debería pasar'} el control de acceso de ${k}, y la respuesta fue ${respuesta.status}`,
        ).toBe(deberiaPasar);
      }
    });
  }
});
