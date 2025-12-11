import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { timingSafeEqual } from 'hono/utils/buffer';
import { Pool } from 'pg';

// Create a new pool instance. It will automatically use the DATABASE_URL from the environment.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // On Fly.io, the database requires an SSL connection. This configuration enables it.
  // We detect if we're on Fly by checking for a Fly-specific environment variable.
  ssl: process.env.FLY_APP_NAME ? { rejectUnauthorized: false } : false,
});

const app = new Hono().basePath('/api');

app.use('/*', cors());

console.log("Omefans API: Secure auth enabled.");

// Helper for password validation
const isAuthorized = (password: unknown, secret: string | undefined): boolean => {
	if (!secret || secret.trim() === '') {
		console.error("CRITICAL: Authorization failed because ADMIN_PASSWORD secret is not set.");
		return false;
	}
	const userPassword = typeof password === 'string' ? password : '';
	return timingSafeEqual(userPassword, secret);
};

// --- API Routes ---

app.get('/', (c) => {
	return c.json({ status: 'ok', message: 'Omefans API is running.' });
});

app.get('/gallery', async (c) => {
	try {
		const { rows } = await pool.query('SELECT id, name, description, "imageUrl", "affiliateUrl", created_at as "createdAt" FROM gallery_items ORDER BY "createdAt" DESC');
		return c.json(rows);
	} catch (e: any) {
		console.error('Postgres query failed:', e.message);
		return c.json({ error: 'Failed to retrieve gallery items.' }, 500);
	}
});

app.post('/auth/check', async (c) => {
	try {
		const { password } = await c.json();
		if (!isAuthorized(password, process.env.ADMIN_PASSWORD)) {
			return c.json({ error: 'Unauthorized: Invalid password.' }, 401);
		}
		return c.json({ success: true, message: 'Authentication successful.' });
	} catch (e) {
		return c.json({ error: 'Invalid request body.' }, 400);
	}
});

app.post('/upload', async (c) => {
	try {
		const { password, name, description, imageUrl, affiliateUrl } = await c.json();

		if (!isAuthorized(password, process.env.ADMIN_PASSWORD)) {
			return c.json({ error: 'Forbidden: Invalid password.' }, 403);
		}

		if (!name || !imageUrl || !affiliateUrl) {
			return c.json({ error: 'Name, Image URL, and Affiliate URL are required.' }, 400);
		}

		await pool.query('INSERT INTO gallery_items (name, description, "imageUrl", "affiliateUrl") VALUES ($1, $2, $3, $4)', [name, description || '', imageUrl, affiliateUrl]);

		return c.json({ success: true, message: 'Item added successfully.' }, 201);
	} catch (e: any) {
		console.error('Postgres insert failed:', e.message);
		return c.json({ error: 'Database insertion failed.' }, 500);
	}
});

app.delete('/gallery/:id', async (c) => {
	try {
		const idParam = c.req.param('id');
		const id = parseInt(idParam, 10);
		const { password } = await c.json();

		if (!isAuthorized(password, process.env.ADMIN_PASSWORD)) {
			return c.json({ error: 'Forbidden: Invalid password.' }, 403);
		}

		if (isNaN(id)) {
			return c.json({ error: 'Invalid item ID provided.' }, 400);
		}

		const result = await pool.query('DELETE FROM gallery_items WHERE id = $1', [id]);

		if (result.rowCount > 0) {
			return c.json({ success: true, message: 'Item deleted successfully.' });
		} else {
			return c.json({ error: 'Item not found.' }, 404);
		}
	} catch (e: any) {
		console.error('Postgres delete failed:', e.message);
		return c.json({ error: 'Database deletion failed.' }, 500);
	}
});

app.put('/gallery/:id', async (c) => {
	try {
		const idParam = c.req.param('id');
		const id = parseInt(idParam, 10);
		const { password, name, description, imageUrl, affiliateUrl } = await c.json();

		if (!isAuthorized(password, process.env.ADMIN_PASSWORD)) {
			return c.json({ error: 'Forbidden: Invalid password.' }, 403);
		}

		if (isNaN(id)) {
			return c.json({ error: 'Invalid item ID provided.' }, 400);
		}

		if (!name || !imageUrl || !affiliateUrl) {
			return c.json({ error: 'Name, Image URL, and Affiliate URL are required.' }, 400);
		}

		const result = await pool.query('UPDATE gallery_items SET name = $1, description = $2, "imageUrl" = $3, "affiliateUrl" = $4 WHERE id = $5', [name, description || '', imageUrl, affiliateUrl, id]);

		if (result.rowCount > 0) {
			return c.json({ success: true, message: 'Item updated successfully.' });
		} else {
			return c.json({ error: 'Item not found.' }, 404);
		}
	} catch (e: any) {
		console.error('Postgres update failed:', e.message);
		return c.json({ error: 'Database update failed.' }, 500);
	}
});

export default app;