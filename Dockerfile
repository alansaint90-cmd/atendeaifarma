FROM node:24-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

RUN npm install --global pnpm@11.19.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY scripts/ativar-hooks.mjs ./scripts/ativar-hooks.mjs
RUN pnpm install --frozen-lockfile
COPY . .
RUN mkdir -p public && pnpm build && pnpm build:provisionamento

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000

COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/src/lib/db/migrations ./src/lib/db/migrations
COPY --from=build --chown=node:node /app/.next/provisionar-proprietario.cjs ./scripts/provisionar-proprietario.cjs

USER node
EXPOSE 3000
CMD ["node", "server.js"]
