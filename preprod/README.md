# Preproducción local

El sistema armado **como en producción**, en tu máquina, para probar lo que
en desarrollo no existe: HTTPS, la cookie `Secure`, las cabeceras de
seguridad reales, el build optimizado y el proxy. Es la fase 9 del plan de
testeo adelantada: al desplegar, solo queda repetir la verificación contra
la URL real.

```bash
pnpm preprod            # construye las imágenes y levanta todo (~10 min la primera vez)
pnpm preprod:verificar  # el chequeo de hardening
pnpm preprod:down       # lo apaga
```

Abrí **https://ccisj.localhost:8443**. El navegador avisa que no conoce el
certificado: es de una autoridad propia de Caddy, local. Las cuentas son las
del seed (`admin@ccisj.uy`, `empresa@ccisj.uy`, `directivo@ccisj.uy`,
`postulante@ccisj.uy`, contraseña `1234`).

Hace falta Docker y el frontend al lado de este repo. La carpeta se toma de
`FRONTEND_DIR` en el `.env`, igual que en `docker-compose.yml`
(por defecto `../frontend`).

## Qué levanta

| Servicio | Qué es |
| --- | --- |
| `caddy` | El proxy con HTTPS: `https://ccisj.localhost:8443`, la app en `/` y la API en `/api` |
| `api` | La imagen de producción de la API (`Dockerfile.prod`), con `NODE_ENV=production` y `TRUST_PROXY=1` |
| `web` | La imagen de producción del frontend (`Dockerfile.prod` del frontend): nginx con las cabeceras de seguridad |
| `db` | PostgreSQL 17 en RAM, con las migraciones y el seed |
| `preparar` | Aplica las migraciones y el seed, y termina |
| `storage` | El Storage falso en vez de Supabase (`scripts/storage-falso-http.mts`) |

App y API van en **el mismo sitio** a propósito: es lo que necesita la cookie
`SameSite=Lax`, y es lo que hay que reproducir al desplegar.

**Nunca toca la base del equipo:** la base es propia, vive en RAM y se borra
al apagar. El `JWT_SECRET` lo genera `pnpm preprod` en cada arranque, y no es
el del `.env`.

Lo único que no es como en producción son los servicios externos. Storage
es el falso, y sus enlaces van por HTTP en el puerto 8480. Los emails quedan
en la base, porque no corre el worker. Todo lo demás es la imagen que se
desplegaría.

## La verificación (`pnpm preprod:verificar`)

`scripts/verificar-despliegue.mts` hace 21 chequeos y termina con error si
alguno falla:

- **HTTPS:** TLS 1.2 o 1.3, y que HTTP redirija a HTTPS.
- **Cabeceras:** HSTS de 180 días o más, CSP sin `unsafe-inline`, sin frames,
  `nosniff` y sin versiones de software, en el frontend y en la API.
- **CORS:** un sitio ajeno no puede leer la API y el frontend sí.
- **Errores:** 404 en JSON, sin stack trace ante un JSON roto, 401 sin sesión.
- **Cookie de sesión:** `Secure`, `HttpOnly` y `SameSite`, y que la sesión
  funcione por HTTPS.

Solo lee y hace un login. Para el despliegue real:

```bash
VERIFICAR_EMAIL=... VERIFICAR_PASSWORD=... pnpm exec tsx scripts/verificar-despliegue.mts --web https://<app> --api https://<app>/api
```

La cuenta tiene que ser **una de prueba**, nunca la de una persona.

Para saber que los chequeos sirven, se rompió la configuración de Caddy a
propósito, de a una cosa: CSP con `unsafe-inline`, cookie sin `Secure`, la
versión del servidor en las respuestas. Cada vez falló el chequeo
correspondiente.

## Regresión y DAST sobre la preproducción

Los recorridos E2E del frontend corren contra la preproducción. Desde el
repo del frontend:

```bash
E2E_URL=https://ccisj.localhost:8443 E2E_API=https://ccisj.localhost:8443/api pnpm test:e2e
```

El escaneo pasivo de ZAP sobre el frontend corre en la misma red de Docker,
así encuentra `ccisj.localhost`:

```bash
docker run --rm --network ccisj-preprod_default ghcr.io/zaproxy/zaproxy:2.17.0 zap-baseline.py -t https://ccisj.localhost:8443 -j -m 3 -I
```

Resultado del 03/11 (en Git Bash, con `MSYS_NO_PATHCONV=1`):

- E2E: 6 de 6.
- ZAP: 0 fallos, 65 chequeos pasados y 3 avisos informativos. Son normales
  en una aplicación de una sola página: el `no-cache` del `index.html` y la
  detección de que es una app moderna.
- Ninguna violación de la CSP en las pantallas de los tres roles.

El DAST activo sobre la API sigue siendo `pnpm dast:activo` (ver
`dast/README.md`): es el mismo código que corre en esta imagen.
