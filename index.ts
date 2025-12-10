import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { timingSafeEqual } from 'hono/utils/buffer';
import { sql } from '@vercel/postgres';

const app = new Hono().basePath('/api');

app.use('/*', cors());

console.log("Vercel Worker v1.0: Secure auth enabled.");

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
	return c.json({ status: 'ok', message: 'Omefans API on Vercel is running.' });
});

app.get('/gallery', async (c) => {
	try {
		const { rows } = await sql`SELECT id, name, description, "imageUrl", "affiliateUrl", created_at as "createdAt" FROM gallery_items ORDER BY "createdAt" DESC`;
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

		await sql`INSERT INTO gallery_items (name, description, "imageUrl", "affiliateUrl") VALUES (${name}, ${description || ''}, ${imageUrl}, ${affiliateUrl})`;

		return c.json({ success: true, message: 'Item added successfully.' }, 201);
	} catch (e: any) {
		console.error('Postgres insert failed:', e.message);
		return c.json({ error: 'Database insertion failed.' }, 500);
	}
});

app.delete('/gallery/:id', async (c) => {
	try {
		const id = c.req.param('id');
		const { password } = await c.json();

		if (!isAuthorized(password, process.env.ADMIN_PASSWORD)) {
			return c.json({ error: 'Forbidden: Invalid password.' }, 403);
		}

		const result = await sql`DELETE FROM gallery_items WHERE id = ${id}`;

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
		const id = c.req.param('id');
		const { password, name, description, imageUrl, affiliateUrl } = await c.json();

		if (!isAuthorized(password, process.env.ADMIN_PASSWORD)) {
			return c.json({ error: 'Forbidden: Invalid password.' }, 403);
		}

		if (!name || !imageUrl || !affiliateUrl) {
			return c.json({ error: 'Name, Image URL, and Affiliate URL are required.' }, 400);
		}

		const result = await sql`UPDATE gallery_items SET name = ${name}, description = ${description || ''}, "imageUrl" = ${imageUrl}, "affiliateUrl" = ${affiliateUrl} WHERE id = ${id}`;

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

export default app.fetch;