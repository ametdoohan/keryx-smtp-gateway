FROM node:22-alpine AS deps

WORKDIR /app

RUN apk add --no-cache python3 make g++

COPY package*.json ./
RUN npm ci --omit=dev

FROM node:22-alpine AS runtime

WORKDIR /app

RUN apk add --no-cache openssl

ENV NODE_ENV=production
ENV APP_PORT=3000
ENV SMTP_HOST=0.0.0.0
ENV SMTP_PORT=2465

COPY --from=deps /app/node_modules ./node_modules
COPY src ./src
COPY package*.json ./

EXPOSE 3000 2465

CMD ["npm", "run", "start"]
