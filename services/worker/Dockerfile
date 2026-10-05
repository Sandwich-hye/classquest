# ---- Build stage ----
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
RUN npm run build -w @classquest/shared -w @classquest/worker

# ---- Runtime stage ----
FROM node:20-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/packages/shared/package.json ./packages/shared/
COPY --from=build /app/services/worker/dist ./services/worker/dist
COPY --from=build /app/services/worker/package.json ./services/worker/
USER node
CMD ["node", "services/worker/dist/index.js"]
