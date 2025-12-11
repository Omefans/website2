import dotenv from 'dotenv';
// Load environment variables from .env file. This must be done before any other imports that rely on .env variables.
dotenv.config();

import { serve } from '@hono/node-server';
import app from './index'; // Import the Hono app from the root index.ts

const port = parseInt(process.env.PORT || '3000'); // Fly.io will set the PORT env var based on fly.toml

console.log(`Server is running on port ${port}`);

serve({
  fetch: app.fetch,
  port: port,
});