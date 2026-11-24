FROM node:22-bookworm-slim
ENV NODE_ENV=production PORT=8080 DATABASE_PATH=/app/data/eduaxis.sqlite
WORKDIR /app
COPY --chown=node:node . .
RUN mkdir -p /app/data /app/uploads && chown -R node:node /app
USER node
EXPOSE 8080
CMD ["node", "server.js"]
