FROM node:22-alpine

RUN corepack enable && corepack prepare pnpm@11.25.0 --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

RUN pnpm install --frozen-lockfile

COPY prisma ./prisma
COPY prisma.config.ts ./

RUN DB_URL="postgresql://postgres:postgres@localhost:5432/postgres" pnpm prisma generate

COPY . .

EXPOSE 3000

CMD ["./node_modules/.bin/tsx", "watch", "src/server.ts"]