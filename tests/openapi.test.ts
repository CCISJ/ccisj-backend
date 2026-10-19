/**
 * La descripción OpenAPI (`dast/openapi.yaml`) tiene exactamente los
 * endpoints de la app.
 *
 * Importa por el análisis dinámico: ZAP ataca lo que dice ese archivo y nada
 * más. Un endpoint que falta ahí no se escanea, y nadie se entera, porque el
 * reporte sale igual de limpio. Como en la matriz de autorización, la lista
 * de la app no se escribe a mano: se extrae de Express.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

import { inventariar } from '../scripts/inventario-endpoints.mjs';

const METODOS = ['get', 'post', 'put', 'patch', 'delete'] as const;

type Parametro = { $ref?: string; name?: string; in?: string };
type Ruta = Partial<Record<(typeof METODOS)[number], object>> & {
  parameters?: Parametro[];
};

const spec = parse(
  readFileSync(join(__dirname, '../dast/openapi.yaml'), 'utf8'),
) as {
  paths: Record<string, Ruta>;
  components: { parameters: Record<string, Parametro> };
};

/** `#/components/parameters/SocioId` → la definición de ese parámetro. */
function resolver(parametro: Parametro): Parametro {
  if (!parametro.$ref) return parametro;

  const nombre = parametro.$ref.replace('#/components/parameters/', '');

  return spec.components.parameters[nombre] ?? {};
}

/** `/socios/{id}` → `/socios/:id`, como las escribe Express. */
function aExpress(ruta: string) {
  return ruta.replace(/\{(\w+)\}/g, ':$1');
}

function descritos() {
  return Object.entries(spec.paths).flatMap(([ruta, operaciones]) =>
    METODOS.filter((metodo) => operaciones[metodo]).map(
      (metodo) => `${metodo.toUpperCase()} ${aExpress(ruta)}`,
    ),
  );
}

const existentes = inventariar().map(
  (endpoint) => `${endpoint.metodo} ${endpoint.ruta}`,
);

describe('descripción OpenAPI', () => {
  it('describe todos los endpoints de la app', () => {
    const descritosSet = new Set(descritos());
    const faltan = existentes.filter((clave) => !descritosSet.has(clave));

    expect(
      faltan,
      'Hay endpoints que el escaneo de ZAP no va a ver: describilos en dast/openapi.yaml.',
    ).toEqual([]);
  });

  it('no describe endpoints que ya no existen', () => {
    const existentesSet = new Set(existentes);
    const sobran = descritos().filter((clave) => !existentesSet.has(clave));

    expect(sobran).toEqual([]);
  });

  // Sin esto, ZAP manda la ruta con `{id}` literal y el endpoint responde
  // 400 a todo: se "escanea" sin llegar nunca al código.
  it('cada parámetro de la ruta está declarado con ese nombre', () => {
    const malDeclarados = Object.entries(spec.paths).flatMap(
      ([ruta, operaciones]) => {
        const enLaRuta = [...ruta.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
        const declarados = (operaciones.parameters ?? [])
          .map(resolver)
          .filter((parametro) => parametro.in === 'path')
          .map((parametro) => parametro.name);

        return enLaRuta.join() === declarados.join() ? [] : [ruta];
      },
    );

    expect(malDeclarados).toEqual([]);
  });
});
