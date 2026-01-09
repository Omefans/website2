import { Hono } from 'hono';
import { cors } from 'hono/cors';

// Define the environment variables expected from wrangler.toml
type Bindings = {
	DB: D1Database;
	JWT_SECRET: string; // Secret for signing JWTs, must be set in Cloudflare dashboard
	TELEGRAM_BOT_TOKEN: string;
	TELEGRAM_ADMIN_CHAT_IDS: string; // Comma-separated list of admin chat IDs
	DISCORD_WEBHOOK_OMEGLE: string;
	DISCORD_WEBHOOK_ONLYFANS: string;
	DISCORD_WEBHOOK_CONTACT: string;
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
		const { name, message, category, platform, modelImage } = await c.req.json();

		if (!name || !message) {
			return c.json({ error: 'Missing required fields' }, 400);
		}

		const discordWebhookUrl = c.env.DISCORD_WEBHOOK_CONTACT;

		const res = await fetch(discordWebhookUrl, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				content: `**New Contact Submission**\n**Topic:** ${category || 'General'}\n**Platform:** ${platform || 'N/A'}\n**Name:** ${name}\n**Model Image:** ${modelImage || 'N/A'}\n**Message:**\n${message}`
			})
		});

		// --- Telegram Notification for Admins ---
		const telegramBotToken = c.env.TELEGRAM_BOT_TOKEN;
		// Use the secret if available, otherwise fallback to your hardcoded ID
		const envChatIds = c.env.TELEGRAM_ADMIN_CHAT_IDS ? c.env.TELEGRAM_ADMIN_CHAT_IDS.split(',') : [];
		
		// Fetch additional IDs from DB
		let dbChatIds: string[] = [];
		try {
			const { results } = await c.env.DB.prepare('SELECT chat_id FROM telegram_admins').all();
			dbChatIds = results.map((r: any) => r.chat_id);
		} catch (e) { /* Table might not exist yet */ }

		const adminChatIds = [...new Set([...envChatIds, ...dbChatIds])];

		if (telegramBotToken && adminChatIds.length > 0) {
			const telegramText = `<b>New Contact Submission</b>\n` +
				`<b>Topic:</b> ${category || 'General'}\n` +
				`<b>Platform:</b> ${platform || 'N/A'}\n` +
				`<b>Name:</b> ${name}\n` +
				`<b>Model Image:</b> ${modelImage || 'N/A'}\n` +
				`<b>Message:</b>\n${message}`;

			// Send to each admin asynchronously
			const telegramPromise = Promise.all(adminChatIds.map(chatId => 
				fetch(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						chat_id: chatId.trim(),
						text: telegramText,
						parse_mode: 'HTML'
					})
				})
			)).catch(err => console.error('Telegram Admin Notification Error:', err));

			// Ensure the worker waits for the notification to be sent before stopping
			c.executionCtx.waitUntil(telegramPromise);
		}

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

// Telegram Webhook Route (For getting Chat IDs)
app.post('/api/webhook/telegram', async (c) => {
	try {
		const update = await c.req.json();
		const telegramBotToken = c.env.TELEGRAM_BOT_TOKEN;

		// Check if it's a message and contains text
		if (update.message && update.message.text === '/start') {
			const chatId = update.message.chat.id;
			const adminChatIds = c.env.TELEGRAM_ADMIN_CHAT_IDS ? c.env.TELEGRAM_ADMIN_CHAT_IDS.split(',') : [];
			const isAuthorized = adminChatIds.some(id => id.trim() === chatId.toString());

			const messageText = isAuthorized
				? `Connected! You are authorized to receive notifications.`
				: `Your Chat ID is: <code>${chatId}</code>\n\nAdd this ID to Cloudflare to receive notifications.`;
			
			if (telegramBotToken) {
				await fetch(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						chat_id: chatId,
						text: messageText,
						parse_mode: 'HTML'
					})
				});
			}
		}
		return c.json({ ok: true });
	} catch (e) {
		console.error('Telegram Webhook Error:', e);
		return c.json({ error: 'Error processing update' }, 500);
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
			webhookUrl = c.env.DISCORD_WEBHOOK_ONLYFANS;
		} else {
			// Default to Omegle (or check for 'omegle')
			webhookUrl = c.env.DISCORD_WEBHOOK_OMEGLE;
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
		const telegramBotToken = c.env.TELEGRAM_BOT_TOKEN; 
		// TODO: Replace with your Channel Username (e.g. @OmeFans) or Numeric Chat ID
		const telegramChatId = '@OmeFans'; 

		if (telegramBotToken) {
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

// --- Telegram Admin Management Routes ---

adminRoutes.get('/telegram', async (c) => {
	try {
		const { results } = await c.env.DB.prepare('SELECT * FROM telegram_admins ORDER BY created_at DESC').all();
		return c.json(results);
	} catch (e) {
		return c.json([]); // Return empty if table doesn't exist
	}
});

adminRoutes.post('/telegram', async (c) => {
	const { chat_id, name } = await c.req.json();
	if (!chat_id) return c.json({ error: 'Chat ID is required' }, 400);

	// Ensure table exists (lazy migration)
	await c.env.DB.prepare(`
		CREATE TABLE IF NOT EXISTS telegram_admins (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			chat_id TEXT NOT NULL UNIQUE,
			name TEXT,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP
		)
	`).run();

	try {
		await c.env.DB.prepare('INSERT INTO telegram_admins (chat_id, name) VALUES (?, ?)').bind(chat_id, name).run();
		return c.json({ message: 'Chat ID added successfully' });
	} catch (e: any) {
		if (e.message.includes('UNIQUE')) {
			 return c.json({ error: 'Chat ID already exists' }, 409);
		}
		return c.json({ error: 'Failed to add Chat ID' }, 500);
	}
});

adminRoutes.delete('/telegram/:id', async (c) => {
	const id = c.req.param('id');
	await c.env.DB.prepare('DELETE FROM telegram_admins WHERE id = ?').bind(id).run();
	return c.json({ message: 'Chat ID removed' });
});

// --- Export the Hono app ---
export default app;