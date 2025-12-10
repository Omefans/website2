import { serve } from '@hono/node-server';
import app from './index'; // Import the Hono app from the root index.ts

const port = parseInt(process.env.PORT || '10000'); // Render provides the PORT env var

console.log(`Server is running on port ${port}`);

serve({
  fetch: app.fetch,
  port: port,
});