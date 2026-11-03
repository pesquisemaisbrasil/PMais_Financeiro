FROM node:22-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
RUN npm run build

FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
# O Docker põe o id do container em HOSTNAME, e o Next escutaria só nesse endereço.
ENV HOSTNAME=0.0.0.0

RUN groupadd --system --gid 1001 frontend \
  && useradd --system --uid 1001 --gid frontend --create-home frontend

COPY --from=builder /app/public ./public
COPY --from=builder --chown=frontend:frontend /app/.next/standalone ./
COPY --from=builder --chown=frontend:frontend /app/.next/static ./.next/static

USER frontend

EXPOSE 3000
CMD ["node", "server.js"]
