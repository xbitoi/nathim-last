FROM node:22-slim

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

WORKDIR /app

# Copy workspace config
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json tsconfig.json tsconfig.base.json ./

# Copy all packages
COPY lib/ ./lib/
COPY artifacts/api-server/ ./artifacts/api-server/
COPY artifacts/nour-dashboard/ ./artifacts/nour-dashboard/

# Install all dependencies
RUN pnpm install --frozen-lockfile

# Build dashboard  (output → artifacts/nour-dashboard/dist/public/)
RUN PORT=7860 BASE_PATH=/ NODE_ENV=production \
    pnpm --filter @workspace/nour-dashboard run build

# Build API server (output → artifacts/api-server/dist/)
RUN pnpm --filter @workspace/api-server run build

# Copy dashboard static files into API server bundle folder
RUN cp -r artifacts/nour-dashboard/dist/public artifacts/api-server/dist/public

EXPOSE 7860

ENV PORT=7860
ENV NODE_ENV=production

CMD ["node", "--enable-source-maps", "artifacts/api-server/dist/index.mjs"]
