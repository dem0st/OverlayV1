FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY server.js ./
COPY public ./public

ENV NODE_ENV=production \
    PORT=3000 \
    OVERLAY_DATA_DIR=/data

VOLUME ["/data"]
EXPOSE 3000

CMD ["node", "server.js"]
