ARG NODE_VERSION=22.19.0
FROM node:${NODE_VERSION}-bookworm-slim
ENV HOST=0.0.0.0 PORT=4173
RUN install -d -o node -g node /app
WORKDIR /app
COPY --chown=node:node package.json package-lock.json .npmrc ./
USER node
RUN npm ci
COPY --chown=node:node . .
RUN npm run build
EXPOSE 4173
CMD ["npm", "start"]
