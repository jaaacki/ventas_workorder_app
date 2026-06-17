#syntax=docker/dockerfile:1

FROM node:20-alpine AS base
WORKDIR /app
RUN apk add --no-cache libc6-compat

COPY package*.json ./
COPY fe/package*.json ./fe/
COPY shared/package*.json ./shared/
RUN npm ci

FROM base AS dev
ENV NODE_ENV=development
COPY . .
RUN npm run build -w shared
WORKDIR /app/fe
CMD ["npm", "run", "dev"]

FROM base AS build
ENV NODE_ENV=production
COPY . .
RUN npm run build -w shared && npm run build -w fe

FROM nginx:alpine AS production
COPY --from=build /app/fe/dist /usr/share/nginx/html
COPY fe/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
