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

# Base de datos

La aplicación utiliza PostgreSQL alojado en Supabase.

La conexión se realiza desde Node.js mediante el paquete `pg`.

La configuración se encuentra en:

```text
src/config/database.ts
```

---

# Migraciones

Las migraciones SQL se encuentran en:

```text
database/migrations/
```

Ejemplo:

```text
database/
└── migrations/
    └── 001_initial_schema.sql
```

Las migraciones permiten mantener versionados los cambios en la estructura de la base de datos.

El sistema registra automáticamente qué migraciones ya fueron ejecutadas mediante la tabla:

```text
schema_migrations
```

## Ejecutar migraciones localmente

```bash
pnpm migrate
```

## Ejecutar migraciones utilizando Docker

Con los contenedores levantados:

```bash
docker compose exec backend pnpm migrate
```

Las migraciones ya ejecutadas son ignoradas automáticamente.

---

# Seeds

Los datos de prueba se encuentran en:

```text
database/seeds/
```

Ejemplo:

```text
database/
└── seeds/
    └── 001_initial_data.sql
```

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

# Ejecutar backend sin Docker

Instalar las dependencias:

```bash
pnpm install
```

Iniciar el servidor en modo desarrollo:

```bash
pnpm dev
```

Compilar TypeScript:

```bash
pnpm build
```

Ejecutar la versión compilada:

```bash
pnpm start
```

---

# Scripts disponibles

| Comando        | Descripción                          |
| -------------- | ------------------------------------ |
| `pnpm dev`     | Inicia el backend en modo desarrollo |
| `pnpm build`   | Compila TypeScript                   |
| `pnpm start`   | Ejecuta la versión compilada         |
| `pnpm migrate` | Ejecuta migraciones pendientes       |
| `pnpm seed`    | Inserta datos de prueba              |

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
