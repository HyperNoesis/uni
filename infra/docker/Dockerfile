# One Dockerfile, one target per process: docker build --target api -t campus-api -f infra/docker/Dockerfile .
FROM node:22-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json .npmrc ./
COPY apps ./apps
COPY packages ./packages
RUN pnpm install --prod=false

FROM base AS web
ARG NEXT_PUBLIC_API_URL=http://localhost:4000
ARG NEXT_PUBLIC_REALTIME_URL=ws://localhost:4001
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL NEXT_PUBLIC_REALTIME_URL=$NEXT_PUBLIC_REALTIME_URL NODE_ENV=production
RUN pnpm --filter @campus/web build
EXPOSE 3000
CMD ["pnpm", "--filter", "@campus/web", "start"]

FROM base AS api
ENV NODE_ENV=production
EXPOSE 4000
CMD ["pnpm", "--filter", "@campus/api", "start"]

FROM base AS realtime
ENV NODE_ENV=production
EXPOSE 4001
CMD ["pnpm", "--filter", "@campus/realtime", "start"]

FROM base AS worker
ENV NODE_ENV=production
EXPOSE 4002
CMD ["pnpm", "--filter", "@campus/worker", "start"]

FROM base AS admin
ENV NODE_ENV=production
EXPOSE 4003
CMD ["pnpm", "--filter", "@campus/admin", "start"]
