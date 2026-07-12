FROM node:22-alpine AS dependencies

WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM dependencies AS build

COPY prisma ./prisma
COPY prisma.config.ts nest-cli.json tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN pnpm prisma:generate && pnpm build

FROM build AS production-dependencies

RUN pnpm prune --prod

FROM node:22-alpine AS runtime

ENV NODE_ENV=production
WORKDIR /app
RUN corepack enable

COPY --from=production-dependencies --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json pnpm-lock.yaml prisma.config.ts ./
COPY --chown=node:node prisma/schema.prisma ./prisma/schema.prisma
COPY --chown=node:node prisma/migrations ./prisma/migrations
COPY --chown=node:node prisma/seed.ts ./prisma/seed.ts
COPY --chown=node:node docker/entrypoint.sh ./docker/entrypoint.sh

USER node
EXPOSE 3000
ENTRYPOINT ["./docker/entrypoint.sh"]
