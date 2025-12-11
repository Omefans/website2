# ---- Builder Stage ----
# This stage builds the TypeScript code into JavaScript.
FROM node:20-slim AS builder
WORKDIR /app

# Copy package files and install all dependencies (including devDependencies).
COPY package*.json ./
RUN npm install

# Copy the rest of the source code.
COPY . .

# Compile TypeScript to JavaScript.
RUN npx tsc


# ---- Production Stage ----
# This stage creates the final, lean image for production.
FROM node:20-slim AS production
WORKDIR /app

# Copy package files and install only production dependencies.
COPY package*.json ./
RUN npm install --omit=dev

# Copy the compiled JavaScript from the builder stage.
COPY --from=builder /app/dist ./dist

# The command to start your application.
CMD [ "node", "dist/server.js" ]