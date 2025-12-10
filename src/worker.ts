import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { timingSafeEqual } from 'hono/utils/buffer';

export interface Env {
	DB: D1Database;
	ADMIN_PASSWORD: string;
}

const app = new Hono<{ Bindings: Env }>();

app.use('/api/*', cors());

// Helper for password validation
const isAuthorized = (password: unknown, secret: string): boolean => {
	const userPassword = typeof password === 'string' ? password : '';
	// Use Hono's built-in timing-safe comparison utility
	return timingSafeEqual(userPassword, secret);
};

// --- API Routes ---

app.get('/', (c) => {
	return c.json({ status: 'ok', message: 'Omefans API Worker is running.' });
});

app.get('/api/gallery', async (c) => {
	try {
		const { results } = await c.env.DB.prepare(
			'SELECT id, name, description, imageUrl, affiliate_url, created_at FROM gallery_items ORDER BY created_at DESC'
		).all();
		return c.json(results);
	} catch (e: any) {
		console.error('D1 query failed:', e.message);
		return c.json({ error: 'Failed to retrieve gallery items.' }, 500);
	}
});

app.post('/api/auth/check', async (c) => {
	try {
		const { password } = await c.json();
		if (!isAuthorized(password, c.env.ADMIN_PASSWORD)) {
			return c.json({ error: 'Unauthorized: Invalid password.' }, 401);
		}
		return c.json({ success: true, message: 'Authentication successful.' });
	} catch (e) {
		return c.json({ error: 'Invalid request body.' }, 400);
	}
});

app.post('/api/upload', async (c) => {
	try {
		const { password, name, description, imageUrl, affiliateUrl } = await c.json();

		if (!isAuthorized(password, c.env.ADMIN_PASSWORD)) {
			return c.json({ error: 'Forbidden: Invalid password.' }, 403);
		}

		if (!name || !imageUrl || !affiliateUrl) {
			return c.json({ error: 'Name, Image URL, and Affiliate URL are required.' }, 400);
		}

		await c.env.DB.prepare('INSERT INTO gallery_items (name, description, imageUrl, affiliate_url) VALUES (?, ?, ?, ?)')
			.bind(name, description || '', imageUrl, affiliateUrl)
			.run();

		return c.json({ success: true, message: 'Item added successfully.' }, 201);
	} catch (e: any) {
		console.error('D1 insert failed:', e.message);
		return c.json({ error: 'Database insertion failed.' }, 500);
	}
});

app.delete('/api/gallery/:id', async (c) => {
	try {
		const id = c.req.param('id');
		const { password } = await c.json();

		if (!isAuthorized(password, c.env.ADMIN_PASSWORD)) {
			return c.json({ error: 'Forbidden: Invalid password.' }, 403);
		}

		const { meta } = await c.env.DB.prepare('DELETE FROM gallery_items WHERE id = ?').bind(id).run();

		if (meta.changes > 0) {
			return c.json({ success: true, message: 'Item deleted successfully.' });
		} else {
			return c.json({ error: 'Item not found.' }, 404);
		}
	} catch (e: any) {
		console.error('D1 delete failed:', e.message);
		return c.json({ error: 'Database deletion failed.' }, 500);
	}
});

app.put('/api/gallery/:id', async (c) => {
	try {
		const id = c.req.param('id');
		const { password, name, description, imageUrl, affiliateUrl } = await c.json();

		if (!isAuthorized(password, c.env.ADMIN_PASSWORD)) {
			return c.json({ error: 'Forbidden: Invalid password.' }, 403);
		}

		if (!name || !imageUrl || !affiliateUrl) {
			return c.json({ error: 'Name, Image URL, and Affiliate URL are required.' }, 400);
		}

		const { meta } = await c.env.DB.prepare(
			'UPDATE gallery_items SET name = ?, description = ?, imageUrl = ?, affiliate_url = ? WHERE id = ?'
		)
			.bind(name, description || '', imageUrl, affiliateUrl, id)
			.run();

		if (meta.changes > 0) {
			return c.json({ success: true, message: 'Item updated successfully.' });
		} else {
			return c.json({ error: 'Item not found.' }, 404);
		}
	} catch (e: any) {
		console.error('D1 update failed:', e.message);
		return c.json({ error: 'Database update failed.' }, 500);
	}
});

export default app;