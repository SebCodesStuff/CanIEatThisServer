FROM node:20-slim

WORKDIR /app
ENV NODE_ENV=production
ENV HOST=0.0.0.0

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY tsconfig.json ./
COPY src ./src

USER node
EXPOSE 8080

# Run node directly (not through npm) so it receives SIGTERM from the platform.
CMD ["node", "--import", "tsx", "src/server.ts"]
