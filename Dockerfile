# syntax=docker/dockerfile:1

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
# Render injects PORT (10000) and routes to the EXPOSEd port, so the two must
# agree. Next.js standalone also binds HOSTNAME, which defaults to localhost and
# would be unreachable from outside the container.
ENV PORT=10000
ENV HOSTNAME=0.0.0.0
# The store lives on a mounted volume so a restart doesn't lose the roster.
ENV DATA_DIR=/data

RUN addgroup -g 1001 -S nodejs && adduser -S -u 1001 -G nodejs operator
COPY --from=build /app/public ./public
COPY --from=build --chown=operator:nodejs /app/.next/standalone ./
COPY --from=build --chown=operator:nodejs /app/.next/static ./.next/static

USER operator
EXPOSE 10000
CMD ["node", "server.js"]
