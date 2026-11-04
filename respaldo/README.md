# Respaldo y restauración de la base

Un respaldo que nunca se restauró no es un respaldo: es un archivo que
**suponemos** que sirve. Por eso, además de los comandos para respaldar y
restaurar, está el **simulacro**, que prueba de punta a punta que un respaldo
vuelve a dar exactamente la misma base.

```bash
pnpm respaldo:probar                                   # el simulacro (local)
RESPALDO_DB_URL=... pnpm respaldo                      # respaldar una base
RESTAURAR_DB_URL=... pnpm respaldo:restaurar <archivo> # restaurarlo en una base vacía
```

Solo hace falta **Docker**: `pg_dump`, `pg_restore` y `psql` corren en un
contenedor de `postgres:17-alpine`, la misma línea que usa Supabase. No hay que
instalar PostgreSQL, y `pg_dump` tiene que ser de una versión igual o mayor que
la del servidor.

## El simulacro

```bash
pnpm test:db:up        # si no está levantada
pnpm respaldo:probar   # ~2 minutos
```

1. Crea una base nueva, le aplica las migraciones y el seed con los datos de
   demostración (23 tablas, unas 2350 filas).
2. La respalda con `respaldar()`, la misma función que usa `pnpm respaldo`.
3. Restaura ese archivo en otra base vacía con `restaurar()`, la misma que usa
   `pnpm respaldo:restaurar`.
4. Compara las dos:
   - **los datos**: cuántas filas tiene cada tabla y un md5 de todo su
     contenido, así que una sola celda distinta ya no pasa;
   - **las secuencias**: si quedan atrás, la base parece sana pero la primera
     alta nueva choca con un id que ya existe;
   - **la estructura** completa: tablas, columnas, índices, claves, tipos;
   - que **Prisma la vea al día** (`prisma migrate status`): si no, el próximo
     despliegue intentaría migrarla de nuevo.
5. Borra las dos bases y el archivo.

Corre en el PostgreSQL de la base de pruebas pero en **dos bases propias**,
así que no depende de lo que hayan dejado los tests y nunca toca la base del
equipo: se niega a correr contra algo que no sea local. Termina con código 1
si encuentra una diferencia.

### Cómo sabemos que el simulacro detecta una restauración mala

Se rompió a propósito, de a una cosa, y falló cada vez:

| Rotura | Qué dijo |
| --- | --- |
| A la restauración le falta poner las secuencias en su lugar | `Secuencia "cuota_id_seq": 600 → sin usar`, y lo mismo con cada secuencia usada |
| A la base restaurada le falta un índice | `La estructura (tablas, índices, claves) no es la misma` |
| Una sola celda distinta en la restaurada (un importe + 1) | `Tabla "cuota": 600 filas, md5 1d7b… → 600 filas, md5 967f…` |
| El respaldo sale sin las filas de una tabla (`Socio`) | La restauración se corta entera por las claves foráneas, y la base queda vacía: nunca a medias |

## Respaldar

```bash
RESPALDO_DB_URL="postgresql://usuario:clave@host:5432/base" pnpm respaldo
```

Deja `respaldo/salida/ccisj-AAAAMMDDTHHMMZ.dump`, en el formato propio de
`pg_dump` (comprimido). **A propósito no usa `DB_URL`**: en desarrollo es la
base del equipo, y respaldarla sin querer deja sus datos en un archivo suelto.
Los parámetros que son solo de Prisma (`?schema=`, `pgbouncer`…) se sacan
solos.

Qué entra: el esquema `public` completo, que es el de la aplicación, con el
historial de migraciones (`_prisma_migrations`). Qué no entra: los otros
esquemas de Supabase (`auth`, `storage`…), que son de la plataforma, ni los
dueños y permisos, para que se pueda restaurar con otro usuario.

**El archivo tiene datos personales y los hashes de las contraseñas.**
`respaldo/salida/` no se versiona; guardalo cifrado y fuera de la máquina del
servidor.

Con Supabase, usá la conexión directa o el *session pooler* (puerto 5432), no
el *transaction pooler* (6543): `pg_dump` necesita una sesión entera.

## Restaurar

```bash
RESTAURAR_DB_URL="postgresql://usuario:clave@host:5432/base-nueva" pnpm respaldo:restaurar respaldo/salida/ccisj-....dump
```

**Solo restaura en una base vacía.** Si la de destino tiene algo en `public`,
se niega. Así un error de tipeo no puede pisar la base de nadie, y es lo que
se hace ante un desastre: se crea una base nueva, se restaura ahí y se apunta
el `DB_URL` de la API a ella. Es todo o nada: si algo falla, la base queda
vacía como estaba.

## Lo que todavía no cubre

- **Los archivos** (comprobantes de caja y de pagos, CV) no están en la base:
  la base guarda la ruta y el archivo vive en Supabase Storage. Hay que
  respaldarlos aparte, y cómo depende de dónde se despliegue.
- **Cada cuánto y dónde se guardan.** Es del despliegue: una tarea programada
  en el servidor (por ejemplo, un respaldo diario) y una copia cifrada fuera
  de él. El simulacro mide lo que tarda restaurar con los datos de hoy; con
  los datos reales hay que volver a medirlo.
