import dotenv from 'dotenv';
import { serve } from '@hono/node-server';
import app from './index'; // Import the Hono app from the root index.ts

// Load environment variables from .env file for local development
dotenv.config();

const port = parseInt(process.env.PORT || '3000'); // Fly.io will set the PORT env var based on fly.toml

console.log(`Server is running on port ${port}`);

serve({
  fetch: app.fetch,
  port: port,
});