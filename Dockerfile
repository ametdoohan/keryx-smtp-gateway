FROM node:22-bookworm-slim AS deps

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci --omit=dev

FROM node:22-bookworm-slim AS runtime

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV APP_PORT=3000
ENV SMTP_HOST=0.0.0.0
ENV SMTP_PORT=2465

COPY --from=deps /app/node_modules ./node_modules
COPY src ./src
COPY package*.json ./

EXPOSE 3000 2465

CMD ["npm", "run", "start"]
