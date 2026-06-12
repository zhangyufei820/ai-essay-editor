FROM node:20.19-alpine

WORKDIR /app

ENV NODE_ENV=production

COPY package.json ./
COPY src ./src
COPY config ./config

USER node

EXPOSE 3130

CMD ["node", "src/server.mjs"]
