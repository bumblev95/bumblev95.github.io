FROM node:22-alpine
WORKDIR /app
COPY --chown=node:node geuttae-uri /app/geuttae-uri
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund --prefix /app/geuttae-uri/server
RUN mkdir /app/data && chown node:node /app/data
USER node
ENV HOST=0.0.0.0 PORT=3000 DATA_DIR=/app/data
VOLUME /app/data
EXPOSE 3000
CMD ["node", "geuttae-uri/server/src/server.mjs"]
