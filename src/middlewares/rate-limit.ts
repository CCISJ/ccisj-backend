import rateLimit from 'express-rate-limit';

/**
 * Los límites se apagan en los tests porque todos los requests salen de la
 * misma IP y la suite hace cientos por minuto. `tests/rate-limit.test.ts` los
 * vuelve a encender con `PROBAR_RATE_LIMIT=1` para probar que de verdad
 * cortan: un límite que nunca se ejecuta en los tests es solo una afirmación.
 */
export function rateLimitApagado() {
  return (
    process.env.NODE_ENV === 'test' && process.env.PROBAR_RATE_LIMIT !== '1'
  );
}

/** Pedidos por minuto y por IP que acepta la API en total. */
export const LIMITE_GLOBAL_POR_MINUTO = 300;

// Techo general para toda la API, incluida la bolsa de trabajo pública, que es
// lo único que se puede consultar sin sesión y en masa. No reemplaza a los
// límites de login, registro y cambio de contraseña, que son mucho más bajos y
// cuentan solo los intentos que importan. 300 por minuto es holgado para una
// persona usando el sistema (una pantalla hace menos de diez pedidos) y corta
// un script que recorre la API.
//
// Por IP: detrás de un proxy depende de `TRUST_PROXY` (ver `app.ts`); sin eso
// todos los usuarios compartirían la IP del proxy.
export const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: LIMITE_GLOBAL_POR_MINUTO,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip: rateLimitApagado,
  message: {
    message: 'Demasiadas solicitudes. Intente nuevamente en un minuto.',
  },
});
