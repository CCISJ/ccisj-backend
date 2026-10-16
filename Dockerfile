# Node y pnpm van en las mismas versiones que en el CI
# (.github/workflows/ci.yml): si no, los tests prueban una versión y esta
# imagen corre otra. Al cambiar una, cambiar la otra.
FROM node:24-alpine

# corepack se activa como root porque escribe en /usr/local/bin, y su caché
# queda en una ruta compartida y legible: todo el resto del build corre como
# el usuario `node`, que necesita leer el pnpm ya descargado.
#
# El `pnpm --version` no es decorativo: desde la 12, pnpm baja su binario la
# primera vez que se ejecuta, dentro de esa misma caché. Si esa primera vez
# fuera el `pnpm install` de más abajo, ya como `node`, no podría escribir
# ahí y el build fallaría con EACCES (pasó).
ENV COREPACK_HOME=/opt/corepack
RUN corepack enable \
  && corepack prepare pnpm@12.3.4 --activate \
  && pnpm --version \
  && chmod -R a+rX "$COREPACK_HOME"

# La imagen oficial de node corre como root. Si alguien consigue ejecutar
# código dentro del contenedor, con root tiene el contenedor entero: escribe
# cualquier archivo, instala paquetes y, si el socket de Docker estuviera
# montado, puede salir hacia el host. El usuario `node` ya viene en la imagen
# oficial y no tiene privilegios, así que no hay que crearlo.
#
# /app le pertenece desde el principio y las dependencias se instalan como
# él. Hacerlo así y no con un `chown -R /app` al final es deliberado: ese
# chown tiene que reescribir los 320 MB de node_modules sobre overlayfs y
# agrega más de diez minutos al build (medido).
RUN mkdir -p /app && chown node:node /app
WORKDIR /app
USER node

COPY --chown=node:node package.json pnpm-lock.yaml pnpm-workspace.yaml ./

RUN pnpm install --frozen-lockfile

COPY --chown=node:node prisma ./prisma
COPY --chown=node:node prisma.config.ts ./

RUN DB_URL="postgresql://postgres:postgres@localhost:5432/postgres" pnpm prisma generate

COPY --chown=node:node . .

EXPOSE 3000

CMD ["./node_modules/.bin/tsx", "watch", "src/server.ts"]