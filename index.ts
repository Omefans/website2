import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env, MiddlewareHandler } from 'hono/types';

// Define the environment variables for type safety. This improves
// autocompletion and helps catch errors early.
type AppEnv = {
  Bindings: {
    DB: D1Database;
    ADMIN_PASSWORD: string;
  }
}

const app = new Hono<AppEnv>();

// Use CORS middleware to allow your frontend to call the API.
app.use('/api/*', cors());

/**
 * A constant-time string comparison function.
 * This is important to prevent timing attacks on the password.
 * @param {string} a The user-provided password.
 * @param {string} b The secret password from the environment.
 * @returns {boolean} True if the strings are equal.
 */
const timingSafeEqual = (a: string, b: string): boolean => {
  if (a.length !== b.length) {
    return false;
  }
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
};

// --- AUTHENTICATION MIDDLEWARE ---
// This runs before any protected endpoint to check the password.
const authMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
  const password = c.req.header('Authorization');
  
  // In Cloudflare, ADMIN_PASSWORD will be a secret environment variable.
  const secret = c.env.ADMIN_PASSWORD;

  if (!secret) {
    console.error("CRITICAL: ADMIN_PASSWORD secret is not set in the environment.");
    return c.json({ error: 'Server configuration error.' }, 500);
  }

  // Use the timing-safe comparison function.
  if (!timingSafeEqual(password || '', secret)) {
    return c.json({ error: 'Unauthorized: Invalid password.' }, 401);
  }

  // If the password is correct, proceed to the actual endpoint.
  await next();
};

// --- PUBLIC API ROUTES ---

// Health check endpoint
app.get('/api', (c) => c.json({ status: 'ok', message: 'Omefans API is running.' }));

// Get all gallery items (this is public for everyone to see)
app.get('/api/gallery', async (c) => {
  try {
    const { results } = await c.env.DB.prepare('SELECT id, name, description, "imageUrl", "affiliateUrl", "createdAt" FROM gallery_items ORDER BY "createdAt" DESC').all();
    return c.json(results);
  } catch (e) {
    console.error('D1 query failed:', e.message);
    return c.json({ error: 'Failed to retrieve gallery items.', details: e.message }, 500);
  }
});

// --- PROTECTED ADMIN ROUTES ---

// Check password endpoint
app.post('/api/auth/check', authMiddleware, async (c) => {
  // If authMiddleware passes, the password is correct.
  return c.json({ success: true, message: 'Authentication successful.' });
});

// Upload a new item
app.post('/api/upload', authMiddleware, async (c) => {
  try {
    const { name, description, imageUrl, affiliateUrl } = await c.req.json();

    if (!name || !imageUrl || !affiliateUrl) {
      return c.json({ error: 'Name, Image URL, and Affiliate URL are required.' }, 400);
    }

    await c.env.DB.prepare(
      'INSERT INTO gallery_items (name, description, "imageUrl", "affiliateUrl") VALUES (?, ?, ?, ?)'
    ).bind(name, description || '', imageUrl, affiliateUrl).run();

    return c.json({ success: true, message: 'Item added successfully.' }, 201);
  } catch (e) {
    console.error('D1 insert failed:', e.message);
    // Provide a more detailed error for easier debugging.
    return c.json({ error: 'Database insertion failed.', details: e.message }, 500);
  }
});

// Delete an item
app.delete('/api/gallery/:id', authMiddleware, async (c) => {
  try {
    const id = c.req.param('id');
    if (!id) return c.json({ error: 'Invalid item ID.' }, 400);

    const info = await c.env.DB.prepare('DELETE FROM gallery_items WHERE id = ?').bind(id).run();

    if (info.changes > 0) {
      return c.json({ success: true, message: 'Item deleted successfully.' });
    } else {
      return c.json({ error: 'Item not found.' }, 404);
    }
  } catch (e) {
    console.error('D1 delete failed:', e.message);
    return c.json({ error: 'Database deletion failed.', details: e.message }, 500);
  }
});

// Update an item
app.put('/api/gallery/:id', authMiddleware, async (c) => {
  try {
    const id = c.req.param('id');
    const { name, description, imageUrl, affiliateUrl } = await c.req.json();

    if (!id) return c.json({ error: 'Invalid item ID.' }, 400);
    if (!name || !imageUrl || !affiliateUrl) {
      return c.json({ error: 'Name, Image URL, and Affiliate URL are required.' }, 400);
    }

    // First, verify the item exists to provide a clear "Not Found" error.
    // This also handles the case where an update doesn't change any data,
    // which would otherwise report 0 changes and be misinterpreted as "not found".
    const existingItem = await c.env.DB.prepare('SELECT id FROM gallery_items WHERE id = ?').bind(id).first();

    if (!existingItem) {
      return c.json({ error: 'Item not found.' }, 404);
    }

    // If the item exists, proceed with the update.
    await c.env.DB.prepare(
      'UPDATE gallery_items SET name = ?, description = ?, "imageUrl" = ?, "affiliateUrl" = ? WHERE id = ?'
    ).bind(name, description || '', imageUrl, affiliateUrl, id).run();

    return c.json({ success: true, message: 'Item updated successfully.' });
  } catch (e) {
    console.error('D1 update failed:', e.message);
    return c.json({ error: 'Database update failed.', details: e.message }, 500);
  }
});

// Fallback for any other requests
app.all('*', () => new Response('Not Found.', { status: 404 }));

export default {
  fetch: app.fetch,
};