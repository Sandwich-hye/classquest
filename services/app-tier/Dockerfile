# ---- Build stage: compile the whole TS monorepo ----
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
RUN npm run build -w @classquest/shared -w @classquest/app-tier

# ---- Runtime stage ----
FROM node:20-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/packages/shared/package.json ./packages/shared/
COPY --from=build /app/services/app-tier/dist ./services/app-tier/dist
COPY --from=build /app/services/app-tier/package.json ./services/app-tier/
EXPOSE 4000
# Run as non-root (least privilege at the container level)
USER node
CMD ["node", "services/app-tier/dist/index.js"]
