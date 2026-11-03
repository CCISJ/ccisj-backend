import type { Request } from 'express';

import type { AuthRequest } from '@/middlewares/auth.middleware';

/**
 * Registro de eventos de seguridad: quién entró, quién falló, a quién se le
 * negó algo y quién cambió cuentas. Sin esto, ante un incidente no hay forma
 * de responder "¿esto pasó?, ¿desde dónde?, ¿con qué cuenta?".
 *
 * Cada evento es **una línea JSON** en la salida del proceso, la que recoge
 * cualquier plataforma de despliegue (Docker, Render, Railway...) sin
 * configurar nada. Que sea JSON también es una defensa: `JSON.stringify`
 * escapa los saltos de línea, así que un dato que manda el usuario (la ruta,
 * por ejemplo) no puede fabricar una línea falsa en el registro.
 *
 * **Nunca** se registran contraseñas, tokens, cookies ni el body. Tampoco el
 * email de un login fallido: si la cuenta no existe, ese texto lo escribió
 * cualquiera, y a veces es la contraseña tipeada en el campo equivocado. Las
 * cuentas se identifican por su ID.
 */
export type SecurityEvent =
  | 'login.ok'
  | 'login.fallido'
  | 'login.bloqueado'
  | 'registro.ok'
  | 'registro.bloqueado'
  | 'contrasena.cambiada'
  | 'contrasena.fallida'
  | 'contrasena.bloqueada'
  | 'sesion.invalida'
  | 'acceso.denegado'
  | 'limite.superado'
  | 'usuario.creado'
  | 'usuario.modificado'
  | 'usuario.eliminado'
  | 'socio.alta'
  | 'socio.baja'
  | 'postulante.eliminado';

// Lo que conviene mirar primero: intentos que fallaron o se cortaron.
const WARNINGS: ReadonlySet<SecurityEvent> = new Set([
  'login.fallido',
  'login.bloqueado',
  'registro.bloqueado',
  'contrasena.fallida',
  'contrasena.bloqueada',
  'sesion.invalida',
  'acceso.denegado',
  'limite.superado',
]);

type SecurityData = Record<string, string | number | boolean | null | string[]>;

// Una ruta absurdamente larga no tiene por qué llenar el registro.
const RUTA_MAX = 200;

/**
 * Apagado en los tests, como los rate limits: la suite hace miles de logins y
 * llenaría la salida. `tests/security-log.test.ts` lo enciende con
 * `PROBAR_REGISTRO=1` para probar que cada evento se escribe y sin qué datos.
 */
export function securityLogApagado() {
  return process.env.NODE_ENV === 'test' && process.env.PROBAR_REGISTRO !== '1';
}

/**
 * Escribe un evento. La IP, el método, la ruta (sin la query, que puede traer
 * lo que alguien buscó) y la cuenta de la sesión salen del request; `datos`
 * agrega lo propio de cada evento.
 */
export function logSecurityEvent(
  req: Request,
  evento: SecurityEvent,
  datos: SecurityData = {},
) {
  if (securityLogApagado()) return;

  const user = (req as AuthRequest).user;
  const nivel = WARNINGS.has(evento) ? 'warn' : 'info';

  const linea = JSON.stringify({
    fecha: new Date().toISOString(),
    tipo: 'seguridad',
    nivel,
    evento,
    ip: req.ip ?? null,
    metodo: req.method,
    ruta: req.originalUrl.split('?')[0].slice(0, RUTA_MAX),
    usuarioId: user?.id ?? null,
    rol: user?.tipo ?? null,
    ...datos,
  });

  if (nivel === 'warn') {
    console.warn(linea);
  } else {
    console.info(linea);
  }
}
