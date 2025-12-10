# Use an official Node.js 20 runtime as a parent image
FROM node:20-slim

# Set the working directory in the container
WORKDIR /app

# Copy package.json and package-lock.json to leverage Docker cache
COPY package*.json ./

# Install all dependencies (including devDependencies for building)
RUN npm install

# Copy the rest of your application code into the container
COPY . .

# Compile TypeScript to JavaScript. The output will be in the /dist directory.
RUN npx tsc

# The command to start your application. Render will use this.
CMD [ "node", "dist/server.js" ]