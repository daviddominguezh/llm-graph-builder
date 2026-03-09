# syntax = docker/dockerfile:1

# Adjust NODE_VERSION as desired
ARG NODE_VERSION=22.16.0
FROM node:${NODE_VERSION}-slim AS base

LABEL fly_launch_runtime="Node.js"

# Node.js app lives here
WORKDIR /app

# Set production environment
ENV NODE_ENV="production"


# Throw-away build stage to reduce size of final image
FROM base AS build

# Install packages needed to build node modules
RUN apt-get update -qq && \
    apt-get install --no-install-recommends -y build-essential node-gyp pkg-config python-is-python3

# Copy monorepo root files for workspace install
COPY package.json ./

# Copy workspace package.json files (needed for npm install to resolve workspaces)
COPY packages/graph-types/package.json ./packages/graph-types/
COPY packages/api/package.json ./packages/api/
COPY packages/backend/package.json ./packages/backend/

# Install all dependencies (workspaces need the full install)
RUN npm install --include=dev

# Copy workspace source code (only the packages the backend needs)
COPY packages/graph-types/ ./packages/graph-types/
COPY packages/api/ ./packages/api/
COPY packages/backend/ ./packages/backend/

# Build the backend and its dependencies
RUN npm run build -w @daviddh/graph-types && \
    npm run build -w @daviddh/llm-graph-runner && \
    npm run build -w @daviddh/graph-runner-backend

# Remove development dependencies
RUN npm prune --omit=dev


# Final stage for app image
FROM base

# Copy built application
COPY --from=build /app /app

# Start the server by default, this can be overwritten at runtime
EXPOSE 4000
CMD [ "npm", "run", "start", "-w", "@daviddh/graph-runner-backend" ]
