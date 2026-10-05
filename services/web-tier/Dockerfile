# ---- Frontend build stage: build the React SPA ----
FROM node:20-alpine AS frontend
WORKDIR /fe
COPY apps/frontend/package.json ./
RUN npm install
COPY apps/frontend/ ./
RUN npm run build

# ---- Backend build stage: compile web-tier + shared ----
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY services/app-tier/package.json services/app-tier/
COPY services/web-tier/package.json services/web-tier/
COPY services/worker/package.json services/worker/
RUN npm install --workspaces --include-workspace-root
COPY packages ./packages
COPY services ./services
RUN npm run build -w @classquest/shared -w @classquest/web-tier

# ---- Runtime stage ----
FROM node:20-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/packages/shared/package.json ./packages/shared/
COPY --from=build /app/services/web-tier/dist ./services/web-tier/dist
COPY --from=build /app/services/web-tier/package.json ./services/web-tier/
# Static SPA served by the web tier
COPY --from=frontend /fe/dist ./services/web-tier/public
EXPOSE 8080
USER node
CMD ["node", "services/web-tier/dist/index.js"]
