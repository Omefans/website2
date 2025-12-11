import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env, MiddlewareHandler } from 'hono/types';
import { jwt, sign } from 'hono/jwt'

// Define the environment variables for type safety. This improves
// autocompletion and helps catch errors early.
type AppEnv = {
  Bindings: {
    DB: D1Database;
    ADMIN_PASSWORD: string;
    JWT_SECRET: string;
  }
}

const app = new Hono<AppEnv>();

// Use CORS middleware to allow your frontend to call the API.
// Explicitly allow all origins for broader compatibility, especially for console commands.
app.use('/api/*', cors({
  origin: '*'
}));

// --- Password Hashing Helpers ---
const bufferToHex = (buffer: ArrayBuffer) => Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2, '0')).join('');

async function hashPassword(password: string, salt: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey('raw', encoder.encode(password), { name: 'PBKDF2' }, false, ['deriveBits']);
  const derivedBits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: encoder.encode(salt), iterations: 100000, hash: 'SHA-256' }, keyMaterial, 256);
  return bufferToHex(derivedBits);
}

// --- AUTHENTICATION & AUTHORIZATION MIDDLEWARE ---

// Middleware to verify the JWT token on protected routes.
const authMiddleware = jwt({
  secret: (c) => c.env.JWT_SECRET,
  alg: 'HS256'
});

// Middleware to ensure only users with the 'admin' role can proceed.
const adminOnly: MiddlewareHandler<AppEnv> = async (c, next) => {
  const payload = c.get('jwtPayload');
  if (!payload || payload.role !== 'admin') {
    return c.json({ error: 'Forbidden: This action requires admin privileges.' }, 403);
  }
  await next();
};

// --- PUBLIC API ROUTES ---

// Health check endpoint
app.get('/api', (c) => c.json({ status: 'ok', message: 'Omefans API is running.' }));

// Get all gallery items (this is public for everyone to see)
app.get('/api/gallery', async (c) => {
  try {
    const { sort = 'createdAt', order = 'DESC' } = c.req.query();

    // Whitelist validation to prevent SQL injection.
    const allowedSorts = ['createdAt', 'name'];
    const allowedOrders = ['ASC', 'DESC'];

    const sortField = allowedSorts.includes(sort) ? sort : 'createdAt';
    const sortOrder = allowedOrders.includes(order.toUpperCase()) ? order.toUpperCase() : 'DESC';

    // Use a quoted identifier for "createdAt" to ensure it's a valid column name.
    const safeSortField = sortField === 'createdAt' ? '"createdAt"' : 'name';

    const query = `SELECT id, name, description, "imageUrl", "affiliateUrl", "createdAt" FROM gallery_items ORDER BY ${safeSortField} ${sortOrder}`;
    const { results } = await c.env.DB.prepare(query).all();
    return c.json(results);
  } catch (e: any) {
    console.error('D1 query failed:', e.message);
    return c.json({ error: 'Failed to retrieve gallery items.', details: e.message }, 500);
  }
});

// --- AUTHENTICATION ROUTES ---

app.post('/api/auth/register', async (c) => {
  const userCount = await c.env.DB.prepare('SELECT COUNT(*) as count FROM users').first<{ count: number }>();
  if (userCount && userCount.count > 0) {
    return c.json({ error: 'Registration is closed.' }, 403);
  }

  try {
    const { username, password } = await c.req.json<any>();

    if (!username || !password) {
      return c.json({ error: 'Username and Password are required in the request body.' }, 400);
    }

    const salt = bufferToHex(crypto.getRandomValues(new Uint8Array(16)));
    const passwordHash = await hashPassword(password, salt);
    const finalHash = `${salt}:${passwordHash}`;

    await c.env.DB.prepare('INSERT INTO users (username, passwordHash, role) VALUES (?, ?, ?)')
      .bind(username, finalHash, 'admin')
      .run();

    return c.json({ success: true, message: 'Admin user created successfully. You can now log in.' }, 201);
  } catch (e: any) {
    return c.json({ error: 'Admin creation failed.', details: e.message }, 500);
  }
});

app.post('/api/auth/login', async (c) => {
  try {
    const { username, password } = await c.req.json<any>();
    if (!username || !password) {
      return c.json({ error: 'Username and password are required.' }, 400);
    }

    const user = await c.env.DB.prepare('SELECT * FROM users WHERE username = ?').bind(username).first<{ id: number; username: string; passwordHash: string; role: string; }>();
    if (!user || !user.passwordHash) {
      return c.json({ error: 'Invalid credentials.' }, 401);
    }

    const [salt, storedHash] = user.passwordHash.split(':');
    if (!salt || !storedHash) {
      console.error(`Malformed passwordHash for user: ${username}`);
      return c.json({ error: 'Authentication error. Please contact support.' }, 500);
    }
    const providedHash = await hashPassword(password, salt);

    if (providedHash !== storedHash) {
      return c.json({ error: 'Invalid credentials.' }, 401);
    }

    const payload = { sub: user.id, username: user.username, role: user.role, exp: Math.floor(Date.now() / 1000) + (60 * 60 * 24) }; // 24-hour expiry
    const token = await sign(payload, c.env.JWT_SECRET);

    return c.json({ success: true, token });
  } catch (e: any) {
    console.error('Login failed:', e.message, e.stack);
    return c.json({ error: 'An internal server error occurred during login.', details: e.message }, 500);
  }
});

// --- PROTECTED ADMIN ROUTES ---

// Upload a new item
app.post('/api/upload', authMiddleware, async (c) => {
  try {
    const { name, description, imageUrl, affiliateUrl } = await c.req.json<any>();

    if (!name || !imageUrl || !affiliateUrl) {
      return c.json({ error: 'Name, Image URL, and Affiliate URL are required.' }, 400);
    }

    await c.env.DB.prepare(
      'INSERT INTO gallery_items (name, description, "imageUrl", "affiliateUrl") VALUES (?, ?, ?, ?)'
    ).bind(name, description || '', imageUrl, affiliateUrl).run();

    return c.json({ success: true, message: 'Item added successfully.' }, 201);
  } catch (e: any) {
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
  } catch (e: any) {
    console.error('D1 delete failed:', e.message);
    return c.json({ error: 'Database deletion failed.', details: e.message }, 500);
  }
});

// Update an item
app.put('/api/gallery/:id', authMiddleware, async (c) => {
  try {
    const id = c.req.param('id');
    const { name, description, imageUrl, affiliateUrl } = await c.req.json<any>();

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
  } catch (e: any) {
    console.error('D1 update failed:', e.message);
    return c.json({ error: 'Database update failed.', details: e.message }, 500);
  }
});

// --- ADMIN-ONLY ROUTES ---

// Create a new user (manager)
app.post('/api/users', authMiddleware, adminOnly, async (c) => {
  try {
    const { username, password, role } = await c.req.json<any>();
    if (!username || !password || !role) {
      return c.json({ error: 'Username, password, and role are required.' }, 400);
    }
    if (role !== 'manager') {
      return c.json({ error: 'Only "manager" role can be created.' }, 400);
    }

    const salt = bufferToHex(crypto.getRandomValues(new Uint8Array(16)));
    const passwordHash = await hashPassword(password, salt);
    const finalHash = `${salt}:${passwordHash}`;

    await c.env.DB.prepare('INSERT INTO users (username, passwordHash, role) VALUES (?, ?, ?)')
      .bind(username, finalHash, role).run();
    return c.json({ success: true, message: `User "${username}" created successfully.` }, 201);
  } catch (e: any) {
    if (e.message?.includes('UNIQUE constraint failed')) return c.json({ error: 'Username already exists.' }, 409);
    return c.json({ error: 'Failed to create user.', details: e.message }, 500);
  }
});

// Fallback for any other requests
app.all('*', () => new Response('Not Found.', { status: 404 }));

export default {
  fetch: app.fetch,
};