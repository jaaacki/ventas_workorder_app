#syntax=docker/dockerfile:1

FROM node:24-alpine AS base
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl

# Copy workspace manifests
COPY package*.json ./
COPY be/package*.json ./be/
COPY shared/package*.json ./shared/

# Install all workspace dependencies
RUN npm ci

FROM base AS dev
ENV NODE_ENV=development
ENV DATABASE_URL=postgresql://placeholder:placeholder@localhost:5432/placeholder
COPY . .
RUN npm run build -w shared && npm run db:generate -w be
WORKDIR /app/be
CMD ["npm", "run", "dev"]

FROM base AS build
ENV NODE_ENV=production
ENV DATABASE_URL=postgresql://placeholder:placeholder@localhost:5432/placeholder
COPY . .
RUN npm run build -w shared && npm run db:generate -w be && npm run build -w be

FROM node:24-alpine AS production
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/be/dist ./dist
COPY --from=build /app/be/node_modules ./node_modules
COPY --from=build /app/be/package*.json ./
COPY --from=build /app/node_modules ./node_modules
CMD ["node", "dist/server.js"]
