import { Hono } from 'hono';
import { cors } from 'hono/cors';

// Define the environment variables expected from wrangler.toml
type Bindings = {
	DB: D1Database;
	JWT_SECRET: string; // Secret for signing JWTs, must be set in Cloudflare dashboard
};

// Define custom variables for our context
type Variables = {
    userId: number;
    userRole: string;
}

const app = new Hono<{ Bindings: Bindings, Variables: Variables }>();

// --- API Root Route ---
app.get('/api', (c) => {
	return c.json({
		message: 'Welcome to the Omefans API!',
		version: '1.0.0',
		status: 'operational'
	});
});

// --- Middleware ---

// 1. CORS Middleware
app.use('/api/*', cors({
    origin: '*', // In production, you should restrict this to your frontend's domain
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
}));

// 2. Authentication Middleware
const authMiddleware = async (c, next) => {
	const authHeader = c.req.header('Authorization');
	if (!authHeader || !authHeader.startsWith('Bearer ')) {
		return c.json({ error: 'Missing or invalid Authorization header' }, 401);
	}

	const token = authHeader.substring(7);
	try {
		// This is a simplified decode, as seen in your frontend.
		// For production, use a proper JWT library to verify the signature against env.JWT_SECRET
		const payload = JSON.parse(atob(token.split('.')[1]));

		if (payload.exp * 1000 < Date.now()) {
			return c.json({ error: 'Token expired' }, 401);
		}

		// Attach user info to the request context for downstream handlers
		c.set('userId', payload.sub);
		c.set('userRole', payload.role);
		await next();
	} catch (e) {
		return c.json({ error: 'Invalid token' }, 401);
	}
};

// 3. Admin-only Middleware
const adminMiddleware = async (c, next) => {
	if (c.get('userRole') !== 'admin') {
		return c.json({ error: 'Forbidden: Admin access required' }, 403);
	}
	await next();
};


// --- Public Routes ---

// Login route
app.post('/api/auth/login', async (c) => {
	const { username, password } = await c.req.json();
	if (!username || !password) {
		return c.json({ error: 'Username and password are required' }, 400);
	}

	const user = await c.env.DB.prepare('SELECT id, username, passwordHash, role FROM users WHERE username = ?').bind(username).first();

	// IMPORTANT: This is an insecure password check. In a real app, you must use a library
	// like bcrypt to compare the hashed password.
	if (!user || user.passwordHash !== password) { // Simple string comparison for now
		return c.json({ error: 'Invalid credentials' }, 401);
	}

	const payload = { sub: user.id, role: user.role, username: user.username, exp: Math.floor(Date.now() / 1000) + (60 * 60 * 24) }; // 24-hour expiry
	const header = { alg: 'HS256', typ: 'JWT' };
	const encodedHeader = btoa(JSON.stringify(header)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
	const encodedPayload = btoa(JSON.stringify(payload)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
	const token = `${encodedHeader}.${encodedPayload}.`; // No signature, matching frontend

	return c.json({ token });
});

// Contact route
app.post('/api/contact', async (c) => {
	try {
		const { name, message, category } = await c.req.json();

		if (!name || !message) {
			return c.json({ error: 'Missing required fields' }, 400);
		}

		const discordWebhookUrl = 'https://discord.com/api/webhooks/1458903642877722849/tH83RK1v6lg6qudKks03xaZqskLZe5LQLVdXZIG6Q_uvZ9BtkY8eA4NI_582RMYLgZ4g';

		const res = await fetch(discordWebhookUrl, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				content: `**New Contact Submission**\n**Topic:** ${category || 'General'}\n**Name:** ${name}\n**Message:**\n${message}`
			})
		});

		if (!res.ok) {
			const err = await res.text();
			console.error('Discord Webhook Error:', err);
			return c.json({ error: 'Failed to send request' }, 500);
		}

		return c.json({ message: 'Request sent successfully' });
	} catch (error) {
		console.error('Contact endpoint error:', error);
		return c.json({ error: 'Internal Server Error' }, 500);
	}
});

// Get all gallery items
app.get('/api/gallery', async (c) => {
	const { sort, order } = c.req.query();
    const validSort = ['createdAt', 'name'].includes(sort) ? sort : 'createdAt';
    const validOrder = ['asc', 'desc'].includes(order) ? order.toUpperCase() : 'DESC';

	const stmt = c.env.DB.prepare(
		`SELECT gi.*, u.username as publisherName FROM gallery_items gi LEFT JOIN users u ON gi.userId = u.id ORDER BY ${validSort} ${validOrder}`
	);
	const { results } = await stmt.all();
	return c.json(results);
});


// --- Authenticated Routes (All roles) ---

// Add a new gallery item
app.post('/api/upload', authMiddleware, async (c) => {
	const { name, description, category, imageUrl, affiliateUrl, isFeatured } = await c.req.json();
	if (!name || !imageUrl || !affiliateUrl) {
		return c.json({ error: 'Missing required fields' }, 400);
	}

	const { results } = await c.env.DB.prepare(
		'INSERT INTO gallery_items (name, description, category, isFeatured, imageUrl, affiliateUrl, userId) VALUES (?, ?, ?, ?, ?, ?, ?)'
	).bind(name, description, category, isFeatured ? 1 : 0, imageUrl, affiliateUrl, c.get('userId')).run();

	// --- Discord Notification Logic ---
	try {
		let webhookUrl = '';

		// 1. SELECT WEBHOOK BASED ON CATEGORY
		// PASTE YOUR ACTUAL WEBHOOK URLS BELOW
		if (category === 'onlyfans') {
			webhookUrl = 'https://discord.com/api/webhooks/1458916380031324311/10PpL3zXdfJ4-_WHIm9aba2Tu2s9ikWxeR5bYj2r_ckeTyH2CR6abnpMbAyE4nmqOZAZ';
		} else {
			// Default to Omegle (or check for 'omegle')
			webhookUrl = 'https://discord.com/api/webhooks/1458916103957909678/vzi_wvIzkhfLTB19BUPlCxJ8LgQozGagxQ1kRYuf9vWIL_AZ9SOQ1s7jMDaVHpMzKDRB';
		}

		// 2. SEND NOTIFICATION
		if (webhookUrl && !webhookUrl.includes('YOUR_')) {
			await fetch(webhookUrl, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					content: `@everyone\nNEW EXCLUSIVE🆕️🔥🔥\n🆕️CHECK OUR NEW EXCLUSIVE CONTENT ON OUR WEBSITE🔥🔥❤️`,
					embeds: [{
						title: name,
						description: `${description || ''}\n\n🌐 **Website** - https://omefans.com/gallery\n\n🔁 **BACKUP CHANNEL** - https://t.me/+gQnXEKZqVGIxZDY5\n\n📲 **Discord Server** - https://discord.gg/WaXnU5c5V8\n\n📥 **Share CHANNEL with UR Friends** - https://t.me/OmeFans`,
						color: category === 'onlyfans' ? 0x00AFF0 : 0xFF8800, // Blue for OnlyFans, Orange for Omegle
						image: { url: imageUrl },
						footer: { text: "Omefans Updates" }
					}]
				})
			});
		}
	} catch (e) {
		console.error('Failed to send Discord notification', e);
	}

	// --- Telegram Notification Logic ---
	try {
		// TODO: Replace with your actual Bot Token from @BotFather
		const telegramBotToken = '8391311327:AAH99DgfdBdaq_NK3v7Qw73eWgXtI549QxI'; 
		// TODO: Replace with your Channel Username (e.g. @OmeFans) or Numeric Chat ID
		const telegramChatId = '@OmeFans'; 

		if (telegramBotToken !== 'YOUR_TELEGRAM_BOT_TOKEN') {
			await fetch(`https://api.telegram.org/bot${telegramBotToken}/sendPhoto`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					chat_id: telegramChatId,
					photo: imageUrl,
					caption: `NEW EXCLUSIVE🆕️🔥🔥\n🆕️CHECK OUR NEW EXCLUSIVE CONTENT ON OUR WEBSITE🔥🔥❤️\n\n<b>${category.toUpperCase()}</b>\n<b>${name}</b>\n${description || ''}`,
					parse_mode: 'HTML',
					reply_markup: {
						inline_keyboard: [
							[{ text: '🌐 Website', url: 'https://omefans.com/gallery' }],
							[{ text: '🔁 BACKUP CHANNEL', url: 'https://t.me/+gQnXEKZqVGIxZDY5' }],
							[{ text: '📲 Discord Server', url: 'https://discord.gg/WaXnU5c5V8' }],
							[{ text: '📥 Share CHANNEL with UR Friends', url: 'https://t.me/OmeFans' }]
						]
					}
				})
			});
		}
	} catch (e) {
		console.error('Failed to send Telegram notification', e);
	}

	return c.json({ message: 'Item added successfully!', item: results }, 201);
});

// Update a gallery item
app.put('/api/gallery/:id', authMiddleware, async (c) => {
	const itemId = c.req.param('id');
	const { name, description, category, imageUrl, affiliateUrl, isFeatured } = await c.req.json();
	if (!name || !imageUrl || !affiliateUrl) {
		return c.json({ error: 'Missing required fields' }, 400);
	}

	const info = await c.env.DB.prepare(
		'UPDATE gallery_items SET name = ?, description = ?, category = ?, isFeatured = ?, imageUrl = ?, affiliateUrl = ? WHERE id = ?'
	).bind(name, description, category, isFeatured ? 1 : 0, imageUrl, affiliateUrl, itemId).run();

	if (info.changes === 0) {
		return c.json({ error: 'Item not found or no changes made' }, 404);
	}

	return c.json({ message: 'Item updated successfully!', item: info });
});

// Delete a gallery item
app.delete('/api/gallery/:id', authMiddleware, async (c) => {
    const itemId = c.req.param('id');
	const info = await c.env.DB.prepare('DELETE FROM gallery_items WHERE id = ?').bind(itemId).run();
	if (info.changes === 0) {
		return c.json({ error: 'Item not found' }, 404);
	}
	return c.json({ message: 'Item deleted successfully!' });
});

// Change user password
app.put('/api/profile/password', authMiddleware, async (c) => {
	const { oldPassword, newPassword } = await c.req.json();
	const userId = c.get('userId');

	if (!oldPassword || !newPassword) {
		return c.json({ error: 'Old and new passwords are required' }, 400);
	}

	if (newPassword.length < 6) {
		return c.json({ error: 'New password must be at least 6 characters long' }, 400);
	}

	// Get the current user's stored password hash
	const user = await c.env.DB.prepare('SELECT passwordHash FROM users WHERE id = ?').bind(userId).first();

	if (!user) {
		return c.json({ error: 'User not found' }, 404);
	}

	// IMPORTANT: This is an insecure password check, matching the login logic.
	// In a real app, use a library like bcrypt to compare hashes.
	if (user.passwordHash !== oldPassword) {
		return c.json({ error: 'Incorrect current password' }, 403);
	}

	// In a real app, you MUST hash the new password.
	const newPasswordHash = newPassword; // Placeholder

	await c.env.DB.prepare('UPDATE users SET passwordHash = ? WHERE id = ?')
		.bind(newPasswordHash, userId).run();

	return c.json({ message: 'Password updated successfully!' });
});


// --- Admin-only Routes ---

// Group admin routes
const adminRoutes = app.use('/api/users/*', authMiddleware, adminMiddleware);

// Get all users
adminRoutes.get('/api/users', async (c) => {
	const { results } = await c.env.DB.prepare('SELECT id, username, role, createdAt FROM users ORDER BY createdAt DESC').all();
	return c.json(results);
});

// Create a new user
adminRoutes.post('/api/users', async (c) => {
	const { username, password, role } = await c.req.json();
	if (!username || !password || !role || !['admin', 'manager'].includes(role)) {
		return c.json({ error: 'Missing or invalid fields' }, 400);
	}

	// In a real app, you MUST hash the password.
	const passwordHash = password; // Placeholder

	try {
		await c.env.DB.prepare('INSERT INTO users (username, passwordHash, role) VALUES (?, ?, ?)')
			.bind(username, passwordHash, role).run();
		return c.json({ message: 'User created successfully' }, 201);
	} catch (e: any) {
		if (e.message.includes('UNIQUE constraint failed')) {
			return c.json({ error: 'Username already exists' }, 409);
		}
		return c.json({ error: 'Failed to create user', details: e.message }, 500);
	}
});

// Delete a user
adminRoutes.delete('/api/users/:id', async (c) => {
	const userIdToDelete = c.req.param('id');
	if (c.get('userId').toString() === userIdToDelete) {
		return c.json({ error: 'Admins cannot delete themselves' }, 400);
	}

	const info = await c.env.DB.prepare('DELETE FROM users WHERE id = ?').bind(userIdToDelete).run();
	if (info.changes === 0) {
		return c.json({ error: 'User not found' }, 404);
	}

	return c.json({ message: 'User deleted successfully!' });
});


// --- Export the Hono app ---
export default app;