FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY tsconfig.json vite.config.ts index.html ./
COPY src ./src
COPY electron ./electron
COPY scripts ./scripts
COPY public ./public
RUN npm run build && npm prune --omit=dev --ignore-scripts
ENV PORT=47831
EXPOSE 47831
CMD ["node", "dist-electron/relay.cjs"]
