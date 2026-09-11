# CCISJ Backend

Backend del sistema de gestión del **Centro Comercial e Industrial de San José (CCISJ)**.

El proyecto forma parte de una aplicación web compuesta por:

- Frontend en Vue + TypeScript.
- Backend en Node.js + Express + TypeScript.
- Base de datos PostgreSQL alojada en Supabase.
- Docker para estandarizar el entorno de desarrollo.
- pnpm como gestor de paquetes.

---

## Tecnologías principales

- Node.js
- Express
- TypeScript
- PostgreSQL
- Supabase
- `pg`
- pnpm
- Docker / Docker Compose

---

## Estructura general

Se espera que los repositorios de frontend y backend estén ubicados como carpetas hermanas:

```text
CCISJ/
├── backend/
│   ├── database/
│   │   ├── migrations/
│   │   └── seeds/
│   ├── src/
│   │   ├── config/
│   │   └── database/
│   ├── Dockerfile
│   ├── docker-compose.yml
│   └── ...
│
└── frontend/
    ├── Dockerfile
    └── ...
```

El archivo `docker-compose.yml` se encuentra dentro del repositorio backend y utiliza también la carpeta `../frontend`.

---

# Requisitos

## Opción recomendada: Docker

Para ejecutar el proyecto utilizando Docker solamente es necesario tener instalado:

- Git
- Docker Desktop

Docker se encarga de Node.js, pnpm y las dependencias del proyecto.

## Ejecución sin Docker

Para ejecutar el backend directamente en el sistema se necesita:

- Node.js
- pnpm

---

# Instalación

## 1. Clonar los repositorios

Crear una carpeta para el proyecto:

```bash
mkdir CCISJ
cd CCISJ
```

Clonar el backend:

```bash
git clone https://github.com/CCISJ/ccisj-backend.git backend
```

Clonar el frontend:

```bash
git clone https://github.com/CCISJ/ccisj-frontend.git frontend
```

La estructura debe quedar:

```text
CCISJ/
├── backend/
└── frontend/
```

---

# Variables de entorno

El backend utiliza un archivo `.env` que **no debe subirse a GitHub**.

Crear:

```text
backend/.env
```

utilizando `.env.example` como referencia.

Ejemplo:

```env
PORT=3000
DB_URL=postgresql://...
```

`DB_URL` debe contener la cadena de conexión de PostgreSQL proporcionada por Supabase.

Para desarrollo estamos utilizando la conexión **Session Pooler** de Supabase.

> Nunca subir contraseñas, cadenas de conexión ni otras credenciales al repositorio.

---

# Ejecutar con Docker

Desde la carpeta `backend`:

```bash
docker compose up --build
```

La primera ejecución puede demorar porque Docker debe descargar las imágenes e instalar las dependencias.

Una vez iniciado:

```text
Frontend:
http://localhost:5173

Backend:
http://localhost:3000

Health check:
http://localhost:3000/health
```

Para detener los contenedores:

```bash
docker compose down
```

Para volver a iniciarlos:

```bash
docker compose up
```

---

# Desarrollo con Docker

El código del frontend y backend está montado mediante volúmenes.

Por lo tanto, para cambios normales en archivos `.ts`, `.vue`, etc. **no es necesario reconstruir las imágenes**.

Simplemente:

```bash
docker compose up
```

y modificar el código normalmente.

Vite y `tsx watch` detectarán los cambios automáticamente.

## ¿Cuándo usar `--build`?

Ejecutar:

```bash
docker compose up --build
```

cuando se modifiquen archivos relacionados con las dependencias o la construcción de la imagen, por ejemplo:

```text
package.json
pnpm-lock.yaml
Dockerfile
pnpm-workspace.yaml
```

---

# Sincronizar con el equipo

**Antes de empezar a trabajar, siempre:**

```bash
git pull
pnpm install
pnpm exec prisma generate
pnpm migrate
```

No alcanza con `git pull`. El esquema de la base cambia seguido, y si no
regenerás el cliente de Prisma vas a estar programando contra un modelo que ya
no existe (por ejemplo, buscando `socio.nombre` cuando el campo pasó a llamarse
`razonSocial`).

Si algo no cierra, este comando dice si tu base está al día:

```bash
pnpm exec prisma migrate status
```

---

# Base de datos

La aplicación utiliza PostgreSQL alojado en Supabase.

El acceso se hace con **Prisma**, usando el adaptador `@prisma/adapter-pg`.

Archivos relevantes:

```text
prisma/schema.prisma     modelos y enums
prisma/migrations/       historial de migraciones
prisma/seed.ts           datos de prueba
prisma.config.ts         configuración de Prisma (lee DB_URL del .env)
src/config/prisma.ts     cliente de Prisma que usa la aplicación
src/generated/prisma/    cliente generado (se versiona, no se edita a mano)
```

---

# Migraciones

Prisma registra las migraciones aplicadas en la tabla `_prisma_migrations`.

> ⚠️ **La base de Supabase es compartida por todo el equipo**, y los tests
> corren contra ella.
>
> Nunca corras `prisma migrate dev` ni `prisma migrate reset` contra ella: ante
> la menor diferencia de esquema, Prisma ofrece **resetear la base y borrar
> todos los datos**.
>
> Para aplicar migraciones usá siempre `pnpm migrate`
> (`prisma migrate deploy`), que solo aplica lo pendiente y nunca borra nada.

## Crear una migración nueva

Después de editar `prisma/schema.prisma`:

```bash
# 1. Genera el archivo SQL sin tocar la base
pnpm exec prisma migrate dev --name descripcion_del_cambio --create-only

# 2. Revisá el SQL generado en prisma/migrations/

# 3. Recién ahí, aplicalo
pnpm migrate
pnpm exec prisma generate
```

El paso `--create-only` es el que evita que Prisma toque la base sin que hayas
visto qué va a hacer.

## Si aparece "Drift detected"

Significa que la base no coincide con el historial de migraciones del repo.
Casi siempre es porque alguien aplicó cambios y tu repo está desactualizado.

**No aceptes el reset.** Primero probá `git pull` y volvé a revisar: lo más
probable es que la migración que falta ya esté en el repo remoto.

## Ejecutar migraciones localmente

```bash
pnpm migrate
```

## Ejecutar migraciones utilizando Docker

Con los contenedores levantados:

```bash
docker compose exec backend pnpm migrate
```

Las migraciones ya aplicadas se ignoran automáticamente.

---

# Seeds

Los datos de prueba se encuentran en:

```text
prisma/seed.ts
```

El seed usa `upsert`, así que se puede correr varias veces sin duplicar datos.

Crea el usuario administrador, dos socios con sus empresas, un postulante con
CV, las categorías, una oferta y una postulación de ejemplo.

> Si agregás o cambiás campos en `prisma/schema.prisma`, acordate de actualizar
> también el seed: si queda desactualizado, falla al crear los registros y los
> tests que dependen de esos datos empiezan a fallar.

## Ejecutar seeds localmente

```bash
pnpm seed
```

## Ejecutar seeds mediante Docker

```bash
docker compose exec backend pnpm seed
```

Los seeds se utilizan únicamente para generar datos de desarrollo/prueba.

---

# Autenticación

El login devuelve un JWT que el frontend manda en el header
`Authorization: Bearer <token>`. El secreto con el que se firma sale de
`JWT_SECRET` en el `.env`. El servidor arranca igual sin esa variable, pero
el login y las rutas protegidas fallan en tiempo de request, así que conviene
completarla desde el principio.

```text
src/modules/auth/                    login y emisión del token
src/middlewares/auth.middleware.ts   valida el token en las rutas protegidas
```

---

# Ejecutar backend sin Docker

Instalar las dependencias:

```bash
pnpm install
```

Iniciar el servidor en modo desarrollo:

```bash
pnpm dev
```

Compilar a `dist/`:

```bash
pnpm build
```

Ejecutar la versión compilada:

```bash
pnpm start
```

La carpeta `dist/` no se versiona: la genera cada uno con `pnpm build`.

---

# Scripts disponibles

| Comando        | Descripción                          |
| -------------- | ------------------------------------ |
| `pnpm dev`     | Inicia el backend en modo desarrollo |
| `pnpm build`   | Compila a `dist/`                     |
| `pnpm start`   | Ejecuta la versión compilada         |
| `pnpm test`    | Vitest — pega contra la base real    |
| `pnpm migrate` | Aplica migraciones pendientes        |
| `pnpm seed`    | Inserta datos de prueba (idempotente) |

---

# Flujo recomendado de desarrollo

Actualizar el repositorio:

```bash
git pull
```

Levantar el entorno:

```bash
docker compose up
```

Crear una rama para trabajar:

```bash
git switch -c feature/nombre-funcionalidad
```

Realizar los cambios y luego:

```bash
git add .
git commit -m "feat: descripción del cambio"
git push -u origin feature/nombre-funcionalidad
```

Finalmente crear un **Pull Request hacia `main`** desde GitHub.

La rama `main` está protegida y los cambios deben incorporarse mediante Pull Request.

---

# Notas importantes

- No subir `.env`.
- No subir `node_modules`.
- No modificar migraciones que ya hayan sido ejecutadas y compartidas.
- Los cambios nuevos en la estructura de la BD deben agregarse mediante una nueva migración.
- El frontend y backend deben estar en carpetas hermanas para utilizar el `docker-compose.yml` actual.
- Los datos de los seeds son únicamente para desarrollo y pruebas.
