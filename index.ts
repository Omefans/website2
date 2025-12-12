import { Router, IRequest } from 'itty-router';

// Define the environment variables expected from wrangler.toml
export interface Env {
	DB: D1Database;
	JWT_SECRET: string; // Secret for signing JWTs, must be set in Cloudflare dashboard
}

// Extend the IRequest type from itty-router to include our custom properties
export interface AuthenticatedRequest extends IRequest {
	userId: number;
	userRole: string;
}

// --- CORS Middleware ---
// Handles preflight requests and adds CORS headers to responses.
function handleCors(request: Request) {
	const headers = {
		'Access-Control-Allow-Origin': '*', // In production, restrict this to your frontend's domain
		'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
		'Access-Control-Allow-Headers': 'Content-Type, Authorization',
	};

	if (request.method === 'OPTIONS') {
		return new Response(null, { headers });
	}

	return { headers }; // Returns headers to be added to the actual response
}

// --- Authentication Middleware ---
// Verifies the JWT from the Authorization header.
async function handleAuth(request: AuthenticatedRequest, env: Env) {
	const authHeader = request.headers.get('Authorization');
	if (!authHeader || !authHeader.startsWith('Bearer ')) {
		return new Response(JSON.stringify({ error: 'Missing or invalid Authorization header' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
	}

	const token = authHeader.substring(7);
	try {
		// This is a simplified decode, as seen in your frontend.
		// For production, use a proper JWT library to verify the signature against env.JWT_SECRET
		const payload = JSON.parse(atob(token.split('.')[1]));

		if (payload.exp * 1000 < Date.now()) {
			return new Response(JSON.stringify({ error: 'Token expired' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
		}

		// Attach user info to the request for downstream handlers
		request.userId = payload.sub;
		request.userRole = payload.role;
	} catch (e) {
		return new Response(JSON.stringify({ error: 'Invalid token' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
	}
}

// --- Admin-only Middleware ---
function requireAdmin(request: AuthenticatedRequest) {
	if (request.userRole !== 'admin') {
		return new Response(JSON.stringify({ error: 'Forbidden: Admin access required' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
	}
}

const router = Router();

// --- Public Routes ---

// Login route - NOTE: This uses a placeholder for password checking.
router.post('/api/auth/login', async (request: IRequest, env: Env) => {
	const { username, password } = await request.json();
	if (!username || !password) return new Response(JSON.stringify({ error: 'Username and password are required' }), { status: 400 });

	const user = await env.DB.prepare('SELECT id, passwordHash, role FROM users WHERE username = ?').bind(username).first();

	// IMPORTANT: This is an insecure password check. In a real app, you must use a library
	// like bcrypt to compare the hashed password.
	if (!user /* || !(await bcrypt.compare(password, user.passwordHash)) */) {
		return new Response(JSON.stringify({ error: 'Invalid credentials' }), { status: 401 });
	}

	const payload = { sub: user.id, role: user.role, exp: Math.floor(Date.now() / 1000) + (60 * 60 * 24) };
	const header = { alg: 'HS256', typ: 'JWT' };
	const encodedHeader = btoa(JSON.stringify(header)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
	const encodedPayload = btoa(JSON.stringify(payload)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
	const token = `${encodedHeader}.${encodedPayload}.`; // No signature, matching frontend

	return new Response(JSON.stringify({ token }), { status: 200 });
});

// Get all gallery items
router.get('/api/gallery', async (request: IRequest, env: Env) => {
	const { searchParams } = new URL(request.url);
    const sort = ['createdAt', 'name'].includes(searchParams.get('sort')) ? searchParams.get('sort') : 'createdAt';
    const order = ['asc', 'desc'].includes(searchParams.get('order')) ? searchParams.get('order') : 'desc';

	const stmt = env.DB.prepare(
		`SELECT gi.*, u.username as publisherName FROM gallery_items gi LEFT JOIN users u ON gi.userId = u.id ORDER BY ${sort} ${order.toUpperCase()}`
	);
	const { results } = await stmt.all();
	return new Response(JSON.stringify(results), { status: 200 });
});

// --- Authenticated Routes ---

// Add a new gallery item
router.post('/api/upload', handleAuth, async (request: AuthenticatedRequest, env: Env) => {
	const { name, description, category, imageUrl, affiliateUrl, isFeatured } = await request.json();
	if (!name || !imageUrl || !affiliateUrl) return new Response(JSON.stringify({ error: 'Missing required fields' }), { status: 400 });

	const { results } = await env.DB.prepare(
		'INSERT INTO gallery_items (name, description, category, isFeatured, imageUrl, affiliateUrl, userId, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
	).bind(name, description, category, isFeatured ? 1 : 0, imageUrl, affiliateUrl, request.userId, new Date().toISOString()).run();

	return new Response(JSON.stringify({ message: 'Item added successfully!', item: results }), { status: 201 });
});

// Update a gallery item
router.put('/api/gallery/:id', handleAuth, async (request: AuthenticatedRequest, env: Env) => {
	const itemId = request.params.id;
	const { name, description, category, imageUrl, affiliateUrl, isFeatured } = await request.json();
	if (!name || !imageUrl || !affiliateUrl) return new Response(JSON.stringify({ error: 'Missing required fields' }), { status: 400 });

	const info = await env.DB.prepare(
		'UPDATE gallery_items SET name = ?, description = ?, category = ?, isFeatured = ?, imageUrl = ?, affiliateUrl = ? WHERE id = ?'
	).bind(name, description, category, isFeatured ? 1 : 0, imageUrl, affiliateUrl, itemId).run();

	if (info.changes === 0) return new Response(JSON.stringify({ error: 'Item not found or no changes made' }), { status: 404 });

	return new Response(JSON.stringify({ message: 'Item updated successfully!', item: info }), { status: 200 });
});

// Delete a gallery item
router.delete('/api/gallery/:id', handleAuth, async (request: AuthenticatedRequest, env: Env) => {
	const info = await env.DB.prepare('DELETE FROM gallery_items WHERE id = ?').bind(request.params.id).run();
	if (info.changes === 0) return new Response(JSON.stringify({ error: 'Item not found' }), { status: 404 });
	return new Response(JSON.stringify({ message: 'Item deleted successfully!' }), { status: 200 });
});

// --- Admin-only Routes ---

// Get all users
router.get('/api/users', handleAuth, requireAdmin, async (request: AuthenticatedRequest, env: Env) => {
	const { results } = await env.DB.prepare('SELECT id, username, role, createdAt FROM users ORDER BY createdAt DESC').all();
	return new Response(JSON.stringify(results), { status: 200 });
});

// Create a new user
router.post('/api/users', handleAuth, requireAdmin, async (request: AuthenticatedRequest, env: Env) => {
	const { username, password, role } = await request.json();
	if (!username || !password || !role || !['admin', 'manager'].includes(role)) return new Response(JSON.stringify({ error: 'Missing or invalid fields' }), { status: 400 });

	// In a real app, you MUST hash the password.
	const passwordHash = password; // Placeholder for: await bcrypt.hash(password, 10);

	try {
		await env.DB.prepare('INSERT INTO users (username, passwordHash, role, createdAt) VALUES (?, ?, ?, ?)')
			.bind(username, passwordHash, role, new Date().toISOString()).run();
		return new Response(JSON.stringify({ message: 'User created successfully' }), { status: 201 });
	} catch (e: any) {
		if (e.message.includes('UNIQUE constraint failed')) return new Response(JSON.stringify({ error: 'Username already exists' }), { status: 409 });
		return new Response(JSON.stringify({ error: 'Failed to create user', details: e.message }), { status: 500 });
	}
});

// Delete a user
router.delete('/api/users/:id', handleAuth, requireAdmin, async (request: AuthenticatedRequest, env: Env) => {
	const userIdToDelete = request.params.id;
	if (request.userId.toString() === userIdToDelete) return new Response(JSON.stringify({ error: 'Admins cannot delete themselves' }), { status: 400 });

	const info = await env.DB.prepare('DELETE FROM users WHERE id = ?').bind(userIdToDelete).run();
	if (info.changes === 0) return new Response(JSON.stringify({ error: 'User not found' }), { status: 404 });

	return new Response(JSON.stringify({ message: 'User deleted successfully' }), { status: 200 });
});

// 404 handler
router.all('*', () => new Response('Not Found.', { status: 404 }));

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const cors = handleCors(request);
		if (cors instanceof Response) return cors;

		try {
			const response = await router.handle(request, env);
			
			// Add CORS headers to the final response
			Object.entries(cors.headers).forEach(([key, value]) => {
				response.headers.set(key, value);
			});

			return response;
		} catch (err: any) {
			console.error(err);
			const errorResponse = new Response(JSON.stringify({ error: 'Internal Server Error' }), { status: 500 });
			
            // Add CORS headers to error responses too
            Object.entries(cors.headers).forEach(([key, value]) => {
				errorResponse.headers.set(key, value);
			});

            return errorResponse;
		}
	},
};