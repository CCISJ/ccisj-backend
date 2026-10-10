/**
 * Pruebas de la configuración y de los controles que dependen de ella.
 *
 * Son parte de la evidencia del hardening: cada control que se afirma en la
 * documentación tiene acá un test que lo verifica. Un documento que dice "el
 * body está limitado" no prueba nada; un 413 sí.
 */
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import app from '../src/app';
import { loadEnvironment } from '../src/config/environment';
import { createAdmin, deleteUsers } from './session';

/** Lo mínimo que la aplicación necesita para arrancar. */
const ENTORNO_VALIDO = {
  DB_URL: 'postgresql://usuario:clave@localhost:5432/base',
  JWT_SECRET: 'x'.repeat(32),
} satisfies NodeJS.ProcessEnv;

describe('Configuración del entorno', () => {
  describe('se niega a arrancar si falta algo esencial', () => {
    it('sin JWT_SECRET', () => {
      expect(() => loadEnvironment({ DB_URL: ENTORNO_VALIDO.DB_URL })).toThrow(
        /JWT_SECRET no está definida/,
      );
    });

    it('sin DB_URL', () => {
      expect(() =>
        loadEnvironment({ JWT_SECRET: ENTORNO_VALIDO.JWT_SECRET }),
      ).toThrow(/DB_URL no está definida/);
    });

    it('con un JWT_SECRET demasiado corto, que es casi lo mismo que ninguno', () => {
      expect(() =>
        loadEnvironment({ ...ENTORNO_VALIDO, JWT_SECRET: 'corto' }),
      ).toThrow(/JWT_SECRET tiene 5 caracteres y necesita al menos 32/);
    });

    it('con un PORT que no es un puerto', () => {
      expect(() =>
        loadEnvironment({ ...ENTORNO_VALIDO, PORT: '99999' }),
      ).toThrow(/PORT tiene que ser un entero entre 1 y 65535/);
    });

    it('con un BODY_LIMIT que no es un tamaño', () => {
      expect(() =>
        loadEnvironment({ ...ENTORNO_VALIDO, BODY_LIMIT: 'grande' }),
      ).toThrow(/BODY_LIMIT tiene que ser un tamaño/);
    });

    it('con un TRUST_PROXY que no es ni booleano ni cantidad de saltos', () => {
      expect(() =>
        loadEnvironment({ ...ENTORNO_VALIDO, TRUST_PROXY: 'quizas' }),
      ).toThrow(/TRUST_PROXY tiene que ser/);
    });
  });

  it('informa todos los problemas juntos y no solo el primero', () => {
    // Quien configura el servidor los arregla de una pasada en vez de
    // descubrirlos de a uno, reiniciando cada vez.
    let mensaje = '';

    try {
      loadEnvironment({ PORT: 'cero' });
    } catch (error) {
      mensaje = (error as Error).message;
    }

    expect(mensaje).toMatch(/DB_URL/);
    expect(mensaje).toMatch(/JWT_SECRET/);
    expect(mensaje).toMatch(/PORT/);
  });

  describe('valores por omisión', () => {
    it('son los que ya aplicaba la aplicación, para no cambiar su comportamiento', () => {
      const entorno = loadEnvironment(ENTORNO_VALIDO);

      expect(entorno.port).toBe(3000);
      expect(entorno.bodyLimit).toBe('100kb');
      expect(entorno.allowedOrigins).toEqual(['http://localhost:5173']);
    });

    it('no confía en ningún proxy: sin proxy delante, X-Forwarded-For se puede falsificar', () => {
      expect(loadEnvironment(ENTORNO_VALIDO).trustProxy).toBe(false);
    });
  });

  describe('lectura de valores', () => {
    it('normaliza la lista de orígenes: separa por coma, recorta y descarta vacíos', () => {
      const entorno = loadEnvironment({
        ...ENTORNO_VALIDO,
        CORS_ORIGIN: ' https://ccisj.uy , ,https://www.ccisj.uy ',
      });

      expect(entorno.allowedOrigins).toEqual([
        'https://ccisj.uy',
        'https://www.ccisj.uy',
      ]);
    });

    it('acepta una cantidad de proxies, que es la forma recomendada', () => {
      expect(
        loadEnvironment({ ...ENTORNO_VALIDO, TRUST_PROXY: '1' }).trustProxy,
      ).toBe(1);
    });

    it('acepta "true", aunque confíe en toda la cadena de la cabecera', () => {
      expect(
        loadEnvironment({ ...ENTORNO_VALIDO, TRUST_PROXY: 'true' }).trustProxy,
      ).toBe(true);
    });
  });
});

describe('Controles de configuración aplicados a la aplicación', () => {
  it('el parser de consultas está fijado en "simple"', () => {
    // Con `extended`, `req.query` puede traer objetos anidados y los
    // controladores que hacen `String(req.query.x)` reciben "[object Object]".
    expect(app.get('query parser')).toBe('simple');
  });

  it('no confía en ningún proxy mientras no se configure uno', () => {
    expect(app.get('trust proxy')).toBe(false);
  });

  it('no revela el servidor en las respuestas', async () => {
    const respuesta = await request(app).get('/');

    expect(respuesta.status).toBe(200);
    expect(respuesta.headers['x-powered-by']).toBeUndefined();
  });

  it('manda las cabeceras de seguridad de helmet', async () => {
    const respuesta = await request(app).get('/');

    expect(respuesta.headers['content-security-policy']).toContain(
      "default-src 'self'",
    );
    expect(respuesta.headers['content-security-policy']).toContain(
      "object-src 'none'",
    );
    expect(respuesta.headers['strict-transport-security']).toContain(
      'max-age=',
    );
    expect(respuesta.headers['x-content-type-options']).toBe('nosniff');
    expect(respuesta.headers['x-frame-options']).toBe('SAMEORIGIN');
  });

  describe('límite de tamaño del body', () => {
    // Se prueba contra una ruta inexistente a propósito: `express.json()` corre
    // antes de las rutas, así que el límite aplica a toda la API y el test no
    // depende de ningún endpoint en particular.
    it('acepta un cuerpo por debajo del límite', async () => {
      const respuesta = await request(app)
        .post('/ruta-inexistente-para-el-test')
        .send({ relleno: 'x'.repeat(50 * 1024) });

      expect(respuesta.status).toBe(404);
    });

    it('rechaza con 413 un cuerpo que lo supera', async () => {
      const respuesta = await request(app)
        .post('/ruta-inexistente-para-el-test')
        .send({ relleno: 'x'.repeat(200 * 1024) });

      expect(respuesta.status).toBe(413);
    });

    it('al rechazarlo no filtra el stack ni detalles internos', async () => {
      const respuesta = await request(app)
        .post('/ruta-inexistente-para-el-test')
        .send({ relleno: 'x'.repeat(200 * 1024) });

      expect(respuesta.body).toEqual({ message: 'Solicitud inválida' });
      expect(JSON.stringify(respuesta.body)).not.toMatch(
        /entity.too.large|at /i,
      );
    });
  });

  describe('request sin body', () => {
    // Express 5 deja `req.body` en `undefined` si no llega body, y los
    // controllers que lo desestructuran rompían con un TypeError. Se prueba
    // con dos rutas reales de módulos distintos: lo que importa es que el
    // request llegue a la validación de cada una y responda su propio 400.
    it('llega a la validación de la ruta en vez de romper', async () => {
      const admin = await createAdmin();

      try {
        const cuotas = await request(app)
          .post('/cuotas/configuracion')
          .set('Cookie', admin.cookie);
        const caja = await request(app)
          .post('/caja/movimientos')
          .set('Cookie', admin.cookie);

        expect(cuotas.status).toBe(400);
        expect(cuotas.body.message).toBe(
          'Importe base y fecha de vigencia son obligatorios',
        );
        expect(caja.status).toBe(400);
        expect(caja.body.message).toBe('El tipo de movimiento no es válido');
      } finally {
        await deleteUsers([admin.userId]);
      }
    });
  });
});
