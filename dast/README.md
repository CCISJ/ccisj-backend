# Análisis dinámico de seguridad (DAST)

El análisis estático (SonarCloud, oxlint) lee el código. Este lo **ejecuta**: [OWASP ZAP](https://www.zaproxy.org/) le manda requests a la API andando, primero normales y después con ataques (inyección SQL, XSS, path traversal, inyección de comandos, etc.), y mira qué responde.

```bash
pnpm dast          # pasivo: un request a cada endpoint y revisión de las respuestas (~1 min)
pnpm dast:activo   # además ataca cada parámetro de cada endpoint (bastante más largo)
```

Solo hace falta **Docker** andando. No se toca ningún `.env` ni la base del equipo.

## Qué hace

Todo lo arma `scripts/dast.mts`:

1. **Rehace la base de pruebas** de Docker (la misma de los tests) desde cero. Se niega a correr si `TEST_DB_URL` no es local: un escaneo activo crea, edita y borra.
2. **Arranca la API** con su propia configuración: la base local, un `JWT_SECRET` nuevo en cada corrida y las claves de Storage vacías, para que nunca suba nada al Storage real.
   - Pasivo: `NODE_ENV=production`, para revisar las cabeceras y la cookie como saldrían en producción.
   - Activo: `NODE_ENV=test`, que apaga los rate limits. Con ellos, ZAP recibiría 429 desde el request 300 y no probaría nada. Que los límites funcionan lo prueba `tests/rate-limit.test.ts`.
3. **Crea los datos que necesita el ataque**, por la API: dos juegos de socio, oferta, postulación, pago, movimiento de caja, etc. Sus IDs reemplazan los `x-fixture` de `openapi.yaml`, para que cada ataque llegue a un registro que existe y no se quede en un 404. El segundo juego es solo para los DELETE.
4. **Corre ZAP en Docker** (`ghcr.io/zaproxy/zaproxy`, versión fija) con `zap.yaml`. ZAP importa `openapi.yaml`, que describe los 74 endpoints, con la sesión del admin del seed en cada request.
5. Entre ZAP y la API hay un **proxy que cuenta las respuestas** y anota cada error 5xx con el request que lo provocó. Un 500 es un dato que el código no esperaba y no supo rechazar; ZAP no lo reporta como hallazgo.
6. **Imprime el resumen** y termina con error si hay algún hallazgo de riesgo alto o algún error 5xx. Los falsos positivos ya revisados se marcan en `zap.yaml` (`alertFilter`), cada uno con su motivo y acotado al parámetro exacto.

Los resultados quedan en `dast/salida/` (no se versiona): `<modo>-reporte.html`, el reporte de ZAP para abrir en el navegador; `<modo>-reporte.json` y `<modo>-errores-5xx.txt`.

Después del activo la base de pruebas queda con lo que creó ZAP. Para volver a correr los tests: `pnpm test:db:down && pnpm test:db`.

## `openapi.yaml`

Es la descripción de la API en OpenAPI 3.0, y sirve también como documentación (se abre en cualquier visor, por ejemplo editor.swagger.io). `tests/openapi.test.ts` verifica que describa **exactamente** los endpoints de la app, extraídos de Express: un endpoint nuevo que no se describe hace fallar el test, porque ZAP no lo escanearía y el reporte saldría limpio igual.

Al agregar un endpoint: describirlo con datos de ejemplo **válidos**. Un ataque que parte de un body inválido se queda en la primera validación. Si lleva el ID de un registro, marcarlo con `x-fixture` y, si es un recurso nuevo, crearlo en `crearJuego` (`scripts/dast.mts`).

## Lo que ZAP hace distinto de lo esperable (medido)

Para que los ataques llegaran al código hubo que corregir varias cosas de cómo ZAP arma los requests. Se midió con un servidor que solo registraba lo que le llegaba:

- **Sesión.** Un `replacer` con `${VARIABLE}` no reemplaza la variable dentro de sus reglas, y todo salía sin sesión (401). Se usan `ZAP_AUTH_HEADER` y `ZAP_AUTH_HEADER_VALUE`, propias de ZAP.
- **Campos `email` y `password`.** El complemento Form Handler les pone "zaproxy@example.com" y "ZAP" sin mirar el ejemplo, y la política de contraseñas los rechazaba. Se apagan esas dos reglas.
- **Fechas, `enum` y acentos.** Con `format: date` manda la fecha como "Thu Oct 01 00:00:00 UTC 2026"; con un `enum` elige el primer valor y no el del ejemplo, y los acentos llegan en otra codificación. El script se los arregla en la copia que le pasa a ZAP; `openapi.yaml` queda como documentación.
- **Parámetros de ruta.** ZAP ignora un parámetro de la operación que reemplaza al de la ruta, así que en la copia cada operación tiene los suyos.

## Límites, a propósito

- **Solo con la sesión del admin.** Es el rol que llega a todos los endpoints salvo siete (los propios del socio y del postulante, que responden 403). Los permisos de cada rol en cada endpoint ya los prueba `tests/matriz-autorizacion.test.ts`.
- **Solo la API, no el frontend.** El frontend hoy solo corre con el servidor de desarrollo de Vite; sus cabeceras reales dependen de dónde se despliegue. Se escanea cuando esté desplegado.
- **Sin Storage.** Las subidas llegan hasta la validación del archivo, que es lo que se puede atacar; la subida en sí está probada con un Storage en memoria (`tests/storage-falso.ts`).
