/**
 * Supabase Storage falso, por HTTP, para los tests punta a punta (E2E).
 *
 * Los tests de integración reemplazan Storage con `vi.mock` (ver
 * `tests/storage-falso.ts`), pero en un E2E la API corre como un proceso
 * aparte y no hay nada que mockear. Así que la API habla con este servidor,
 * que se hace pasar por Supabase: `SUPABASE_URL` apunta acá y el cliente de
 * verdad (`@supabase/supabase-js`) manda los mismos requests que mandaría a
 * Supabase.
 *
 * Responde solo lo que la API usa (ver `cv-storage.service.ts` y
 * `receipt-storage.service.ts`):
 *
 * - POST /storage/v1/object/:bucket/:ruta       subir un archivo
 * - DELETE /storage/v1/object/:bucket           borrar ({ prefixes })
 * - POST /storage/v1/object/sign/:bucket/:ruta  crear un enlace firmado
 * - GET /storage/v1/object/sign/:bucket/:ruta   abrir ese enlace
 *
 * El último lo pide el navegador: así el test puede abrir el comprobante o el
 * CV y ver que es el archivo que subió. Los archivos viven en memoria y
 * desaparecen al cerrar el proceso. No verifica la clave ni el token: no
 * protege nada, y solo escucha en la máquina local.
 */
import { randomUUID } from 'node:crypto';
import {
  type IncomingMessage,
  type Server,
  type ServerResponse,
  createServer,
} from 'node:http';

type Archivo = {
  contenido: Buffer;
  tipo: string;
};

const FIRMAR = '/storage/v1/object/sign/';
const OBJETO = '/storage/v1/object/';

function leerCuerpo(req: IncomingMessage): Promise<Buffer> {
  return new Promise<Buffer>((listo, fallo) => {
    const partes: Buffer[] = [];

    req.on('data', (parte: Buffer) => partes.push(parte));
    req.on('end', () => listo(Buffer.concat(partes)));
    req.on('error', fallo);
  });
}

/**
 * `host` es 127.0.0.1 salvo en el entorno de producción local
 * (`produccion-local/`), donde corre en su propio contenedor y tiene que
 * escuchar en la red de Docker, que no sale de la máquina.
 */
export function arrancarStorageFalso(
  puerto: number,
  host = '127.0.0.1',
): Promise<Server> {
  const archivos = new Map<string, Archivo>();

  async function manejarSolicitud(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const ruta = decodeURIComponent(url.pathname);

    function responder(estado: number, cuerpo: unknown): void {
      res.writeHead(estado, { 'content-type': 'application/json' });
      res.end(JSON.stringify(cuerpo));
    }

    function noExiste(): void {
      responder(404, {
        statusCode: '404',
        error: 'not_found',
        message: 'Object not found',
      });
    }

    try {
      if (ruta.startsWith(FIRMAR)) {
        const clave = ruta.slice(FIRMAR.length);

        if (!archivos.has(clave)) {
          noExiste();
          return;
        }

        if (req.method === 'POST') {
          responder(200, {
            signedURL: `/object/sign/${clave}?token=falso`,
          });
          return;
        }

        if (req.method === 'GET') {
          const archivo = archivos.get(clave)!;

          res.writeHead(200, { 'content-type': archivo.tipo });
          res.end(archivo.contenido);
          return;
        }
      } else if (ruta.startsWith(OBJETO)) {
        const clave = ruta.slice(OBJETO.length);

        if (req.method === 'POST') {
          const upsert = req.headers['x-upsert'] === 'true';

          if (archivos.has(clave) && !upsert) {
            responder(400, {
              statusCode: '409',
              error: 'Duplicate',
              message: 'The resource already exists',
            });
            return;
          }

          archivos.set(clave, {
            contenido: await leerCuerpo(req),
            tipo: req.headers['content-type'] ?? 'application/octet-stream',
          });

          responder(200, {
            Id: randomUUID(),
            Key: clave,
          });
          return;
        }

        if (req.method === 'DELETE') {
          const { prefixes = [] } = JSON.parse(
            (await leerCuerpo(req)).toString() || '{}',
          ) as { prefixes?: string[] };

          const borrados = prefixes.filter((prefijo) =>
            archivos.delete(`${clave}/${prefijo}`),
          );

          responder(
            200,
            borrados.map((name) => ({
              name,
              bucket_id: clave,
            })),
          );
          return;
        }
      }

      responder(400, {
        statusCode: '400',
        error: 'unsupported',
        message: `El Storage falso no responde ${req.method} ${ruta}`,
      });
    } catch (error) {
      if (!res.headersSent) {
        responder(500, {
          statusCode: '500',
          error: String(error),
        });
      } else if (!res.writableEnded) {
        res.end();
      }
    }
  }

  const servidor = createServer((req, res) => {
    void manejarSolicitud(req, res).catch((error: unknown) => {
      if (!res.headersSent) {
        res.writeHead(500, {
          'content-type': 'application/json',
        });
      }

      if (!res.writableEnded) {
        res.end(
          JSON.stringify({
            statusCode: '500',
            error: String(error),
          }),
        );
      }
    });
  });

  return new Promise<Server>((listo, fallo) => {
    servidor.once('error', fallo);
    servidor.listen(puerto, host, () => listo(servidor));
  });
}

// Corrido directo (`tsx scripts/storage-falso-http.mts`), arranca solo. Así
// lo usa el contenedor `storage` de `produccion-local/`.
if (import.meta.main) {
  const puerto = Number(process.env.PUERTO ?? 3202);
  const host = process.env.HOST ?? '127.0.0.1';

  await arrancarStorageFalso(puerto, host);
  console.log(`Storage falso en http://${host}:${puerto}`);
}
