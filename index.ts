import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { z } from 'zod';
import webpush from 'web-push';

// Define the environment variables expected from wrangler.toml
type Bindings = {
	DB: D1Database;
	JWT_SECRET: string; // Secret for signing JWTs, must be set in Cloudflare dashboard
	TELEGRAM_BOT_TOKEN: string;
	TELEGRAM_ADMIN_CHAT_IDS: string; // Comma-separated list of admin chat IDs
	DISCORD_WEBHOOK_OMEGLE: string;
	DISCORD_WEBHOOK_ONLYFANS: string;
	DISCORD_WEBHOOK_CONTACT: string;
	DISCORD_WEBHOOK_ANNOUNCEMENTS: string;
	SUBSCRIPTIONS: KVNamespace;
	VAPID_PRIVATE_KEY: string;
};

// Define custom variables for our context
type Variables = {
    userId: number;
    userRole: string;
}

const app = new Hono<{ Bindings: Bindings, Variables: Variables }>();

// --- Helper Functions ---
async function getTelegramToken(env: Bindings): Promise<string> {
	let token = env.TELEGRAM_BOT_TOKEN;
	try {
		const dbToken = await env.DB.prepare("SELECT value FROM configurations WHERE key = 'telegram_bot_token'").first('value');
		if (dbToken) token = dbToken as string;
	} catch (e) {
		// Table might not exist yet or other error, fallback to env var
	}
	return token;
}

async function getDiscordAnnouncementWebhook(env: Bindings): Promise<string> {
	let url = env.DISCORD_WEBHOOK_ANNOUNCEMENTS;
	try {
		const dbUrl = await env.DB.prepare("SELECT value FROM configurations WHERE key = 'discord_webhook_announcements'").first('value');
		if (dbUrl) url = dbUrl as string;
	} catch (e) {
		// Table might not exist yet or other error
	}
	return url;
}

// --- Helper: JWT Security ---
async function signJWT(payload: any, secret: string): Promise<string> {
	const encoder = new TextEncoder();
	const header = { alg: 'HS256', typ: 'JWT' };
	const encodedHeader = btoa(JSON.stringify(header)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
	const encodedPayload = btoa(JSON.stringify(payload)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
	const data = encoder.encode(`${encodedHeader}.${encodedPayload}`);
	
	const key = await crypto.subtle.importKey(
		'raw', encoder.encode(secret || 'fallback_secret_do_not_use_in_prod'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
	);
	const signature = await crypto.subtle.sign('HMAC', key, data);
	const encodedSignature = btoa(String.fromCharCode(...new Uint8Array(signature))).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
	
	return `${encodedHeader}.${encodedPayload}.${encodedSignature}`;
}

async function verifyJWT(token: string, secret: string): Promise<any> {
	const parts = token.split('.');
	if (parts.length !== 3) throw new Error('Invalid token format');
	
	const [encodedHeader, encodedPayload, encodedSignature] = parts;
	const encoder = new TextEncoder();
	const data = encoder.encode(`${encodedHeader}.${encodedPayload}`);
	const signature = new Uint8Array(atob(encodedSignature.replace(/-/g, '+').replace(/_/g, '/')).split('').map(c => c.charCodeAt(0)));
	const key = await crypto.subtle.importKey('raw', encoder.encode(secret || 'fallback_secret_do_not_use_in_prod'), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
	const isValid = await crypto.subtle.verify('HMAC', key, signature, data);
	if (!isValid) throw new Error('Invalid signature');
	return JSON.parse(atob(encodedPayload.replace(/-/g, '+').replace(/_/g, '/')));
}

// --- Helper: System Logging ---
async function logEvent(db: D1Database, level: string, message: string) {
	try {
		await db.prepare(`
			CREATE TABLE IF NOT EXISTS system_logs (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				level TEXT,
				message TEXT,
				created_at DATETIME DEFAULT CURRENT_TIMESTAMP
			)
		`).run();
		await db.prepare('INSERT INTO system_logs (level, message) VALUES (?, ?)').bind(level, message).run();
	} catch (e) { console.error('Logging failed:', e); }
}

// --- API Root Route ---
app.get('/api', (c) => {
	return c.json({
		message: 'Welcome to the Omefans API!',
		version: '1.0.0',
		status: 'operational'
	});
});

// --- Middleware ---

// 0. IP Ban Middleware
app.use('*', async (c, next) => {
	const ip = c.req.header('CF-Connecting-IP') || 'unknown';
	try {
		// Lazy check for table existence to prevent crash on first run
		const banned = await c.env.DB.prepare("SELECT ip FROM banned_ips WHERE ip = ?").bind(ip).first();
		if (banned) {
			return c.text('Access Denied', 403);
		}
	} catch (e) { /* Table might not exist yet */ }
	await next();
});

// 0.5. Maintenance Mode Middleware
app.use('/api/*', async (c, next) => {
	const path = c.req.path;
	// Allow admin, auth, and webhook routes regardless of maintenance mode
	if (path.startsWith('/api/auth') || path.startsWith('/api/users') || path.startsWith('/api/config') || path.startsWith('/api/security') || path.startsWith('/api/logs') || path.startsWith('/api/webhook')) {
		await next();
		return;
	}
	// Check maintenance for public routes
	try {
		const maintenance = await c.env.DB.prepare("SELECT value FROM configurations WHERE key = 'maintenance_mode'").first('value');
		if (maintenance === 'true') return c.json({ error: 'Site is currently in maintenance mode.' }, 503);
	} catch (e) {}
	await next();
});

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
		// Securely verify the token signature
		const payload = await verifyJWT(token, c.env.JWT_SECRET);

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
	const schema = z.object({
		username: z.string(),
		password: z.string()
	});
	const body = await c.req.json();
	const result = schema.safeParse(body);
	if (!result.success) return c.json({ error: 'Invalid input' }, 400);
	const { username, password } = result.data;

	const user = await c.env.DB.prepare('SELECT id, username, passwordHash, role FROM users WHERE username = ?').bind(username).first();

	// IMPORTANT: This is an insecure password check. In a real app, you must use a library
	// like bcrypt to compare the hashed password.
	if (!user || user.passwordHash !== password) { // Simple string comparison for now
		return c.json({ error: 'Invalid credentials' }, 401);
	}

	const payload = { sub: user.id, role: user.role, username: user.username, exp: Math.floor(Date.now() / 1000) + (60 * 60 * 24) }; // 24-hour expiry
	const token = await signJWT(payload, c.env.JWT_SECRET);

	c.executionCtx.waitUntil(logEvent(c.env.DB, 'INFO', `User ${username} logged in`));
	return c.json({ token });
});

// Contact route
app.post('/api/contact', async (c) => {
	try {
		// --- Rate Limiting ---
		const ip = c.req.header('CF-Connecting-IP') || 'unknown';
		const now = Date.now();
		const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute cooldown

		// Ensure table exists (lazy migration) - This is SAFE, it won't delete other tables
		await c.env.DB.prepare(`
			CREATE TABLE IF NOT EXISTS rate_limits (
				ip TEXT PRIMARY KEY,
				last_request INTEGER
			)
		`).run();

		const limitRecord = await c.env.DB.prepare('SELECT last_request FROM rate_limits WHERE ip = ?').bind(ip).first();
		
		if (limitRecord && (now - (limitRecord.last_request as number)) < RATE_LIMIT_WINDOW) {
			return c.json({ error: 'Too many requests. Please wait a minute before sending another message.' }, 429);
		}

		// Update timestamp for this IP
		await c.env.DB.prepare(`
			INSERT INTO rate_limits (ip, last_request) VALUES (?, ?)
			ON CONFLICT(ip) DO UPDATE SET last_request = excluded.last_request
		`).bind(ip, now).run();

		const schema = z.object({
			name: z.string().min(1),
			message: z.string().min(1),
			category: z.string().optional(),
			platform: z.string().optional(),
			modelImage: z.string().optional()
		});
		const body = await c.req.json();
		const result = schema.safeParse(body);
		if (!result.success) return c.json({ error: 'Invalid input fields' }, 400);
		const { name, message, category, platform, modelImage } = result.data;

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

		// --- Send to additional Discord Webhooks from DB ---
		try {
			const { results } = await c.env.DB.prepare('SELECT url FROM discord_webhooks').all();
			if (results && results.length > 0) {
				const discordPayload = JSON.stringify({
					content: `**New Contact Submission**\n**Topic:** ${category || 'General'}\n**Platform:** ${platform || 'N/A'}\n**Name:** ${name}\n**Model Image:** ${modelImage || 'N/A'}\n**Message:**\n${message}`
				});
				
				c.executionCtx.waitUntil(Promise.all(results.map((r: any) => 
					fetch(r.url, {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: discordPayload
					})
				)).catch(err => console.error('Discord DB Webhook Error:', err)));
			}
		} catch (e) { /* Ignore if table doesn't exist */ }

		// --- Telegram Notification for Admins ---
		const telegramBotToken = await getTelegramToken(c.env);
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

// Report route (for broken links/videos)
app.post('/api/report', async (c) => {
	try {
		// --- Rate Limiting for Reports ---
		const ip = c.req.header('CF-Connecting-IP') || 'unknown';
		const now = Date.now();
		const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute cooldown

		// Separate table for reports so it doesn't conflict with contact form limits
		await c.env.DB.prepare(`
			CREATE TABLE IF NOT EXISTS report_rate_limits (
				ip TEXT PRIMARY KEY,
				last_request INTEGER
			)
		`).run();

		const limitRecord = await c.env.DB.prepare('SELECT last_request FROM report_rate_limits WHERE ip = ?').bind(ip).first();
		
		if (limitRecord && (now - (limitRecord.last_request as number)) < RATE_LIMIT_WINDOW) {
			return c.json({ error: 'Too many reports. Please wait a minute before reporting again.' }, 429);
		}

		// Update timestamp
		await c.env.DB.prepare(`
			INSERT INTO report_rate_limits (ip, last_request) VALUES (?, ?)
			ON CONFLICT(ip) DO UPDATE SET last_request = excluded.last_request
		`).bind(ip, now).run();

		// Cleanup old records asynchronously
		c.executionCtx.waitUntil(
			c.env.DB.prepare('DELETE FROM report_rate_limits WHERE last_request < ?').bind(now - 86400000).run()
		);

		const { itemName, category, affiliateUrl, imageUrl } = await c.req.json();

		if (!itemName || !category) {
			return c.json({ error: 'Missing required fields' }, 400);
		}

		const message = `**New Content Report**\n**Item:** ${itemName}\n**Issue:** ${category}\n**Affiliate Link:** ${affiliateUrl || 'N/A'}\n**Image URL:** ${imageUrl || 'N/A'}`;

		// Send to Discord (using Contact webhook)
		const discordWebhookUrl = c.env.DISCORD_WEBHOOK_CONTACT;
		await fetch(discordWebhookUrl, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ content: message })
		});

		// Send to additional Discord Webhooks from DB
		try {
			const { results } = await c.env.DB.prepare('SELECT url FROM discord_webhooks').all();
			if (results && results.length > 0) {
				c.executionCtx.waitUntil(Promise.all(results.map((r: any) => 
					fetch(r.url, {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ content: message })
					})
				)).catch(err => console.error('Discord Report Error:', err)));
			}
		} catch (e) { }

		// Send to Telegram Admins
		const telegramBotToken = await getTelegramToken(c.env);
		const envChatIds = c.env.TELEGRAM_ADMIN_CHAT_IDS ? c.env.TELEGRAM_ADMIN_CHAT_IDS.split(',') : [];
		let dbChatIds: string[] = [];
		try {
			const { results } = await c.env.DB.prepare('SELECT chat_id FROM telegram_admins').all();
			dbChatIds = results.map((r: any) => r.chat_id);
		} catch (e) { }
		const adminChatIds = [...new Set([...envChatIds, ...dbChatIds])];

		if (telegramBotToken && adminChatIds.length > 0) {
			c.executionCtx.waitUntil(Promise.all(adminChatIds.map(chatId => 
				fetch(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						chat_id: chatId.trim(),
						text: `⚠️ <b>Content Report</b>\n\n<b>Item:</b> ${itemName}\n<b>Issue:</b> ${category}\n<b>Affiliate Link:</b> ${affiliateUrl || 'N/A'}\n<b>Image URL:</b> ${imageUrl || 'N/A'}`,
						parse_mode: 'HTML'
					})
				})
			)).catch(err => console.error('Telegram Report Error:', err)));
		}

		return c.json({ message: 'Report received' });
	} catch (error) {
		console.error('Report endpoint error:', error);
		return c.json({ error: 'Internal Server Error' }, 500);
	}
});

// Telegram Webhook Route (For getting Chat IDs)
app.post('/api/webhook/telegram', async (c) => {
	try {
		const update = await c.req.json();
		const telegramBotToken = await getTelegramToken(c.env);

		// --- Handle Callback Queries (Buttons) ---
		if (update.callback_query) {
			const callbackQuery = update.callback_query;
			const chatId = callbackQuery.message.chat.id;
			const messageId = callbackQuery.message.message_id;
			const data = callbackQuery.data;

			// Check authorization
			const envChatIds = c.env.TELEGRAM_ADMIN_CHAT_IDS ? c.env.TELEGRAM_ADMIN_CHAT_IDS.split(',') : [];
			let dbChatIds: string[] = [];
			try {
				const { results } = await c.env.DB.prepare('SELECT chat_id FROM telegram_admins').all();
				dbChatIds = results.map((r: any) => r.chat_id);
			} catch (e) { }
			const isAuthorized = [...envChatIds, ...dbChatIds].some(id => id.trim() === chatId.toString());

			if (isAuthorized) {
				const items = await c.env.DB.prepare('SELECT COUNT(*) as count FROM gallery_items').first('count');
				const users = await c.env.DB.prepare('SELECT COUNT(*) as count FROM users').first('count');
				
				let statsText = '';
				let periodLabel = '';

				if (data === 'stats_daily') {
					periodLabel = 'Today';
					const today = new Date().toISOString().split('T')[0];
					const startOfDay = `${today}T00:00:00Z`;
					try {
						// Traffic
						const totalVisitsResult = await c.env.DB.prepare('SELECT SUM(visits) as total FROM daily_visits WHERE date = ?').bind(today).first();
						const totalVisits = totalVisitsResult?.total || 0;
						const topCountries = await c.env.DB.prepare('SELECT country_code, visits FROM daily_visits WHERE date = ? ORDER BY visits DESC LIMIT 20').bind(today).all();
						
						// Content & Users
						const newItems = await c.env.DB.prepare('SELECT COUNT(*) as count FROM gallery_items WHERE createdAt >= ?').bind(startOfDay).first('count');
						const newUsers = await c.env.DB.prepare('SELECT COUNT(*) as count FROM users WHERE createdAt >= ?').bind(startOfDay).first('count');

						statsText = `📅 <b>Stats for ${periodLabel}</b>\n\n` +
									`👁️ <b>Visits:</b> ${totalVisits}\n` +
									`🖼️ <b>New Items:</b> ${newItems}\n` +
									`👥 <b>New Users:</b> ${newUsers}\n\n` +
									`🌍 <b>Top Countries:</b>\n`;
						
						if (topCountries.results && topCountries.results.length > 0) {
							topCountries.results.forEach((r: any, i: number) => {
								statsText += `${i+1}. <b>${r.country_code}</b>: ${r.visits}\n`;
							});
						} else {
							statsText += 'No visits recorded today.';
						}
					} catch(e) { statsText = 'Error fetching daily stats.'; }
				} else if (data === 'stats_monthly') {
					periodLabel = 'This Month';
					const month = new Date().toISOString().slice(0, 7); // YYYY-MM
					const startOfMonth = `${month}-01T00:00:00Z`;
					try {
						// Traffic
						const totalVisitsResult = await c.env.DB.prepare('SELECT SUM(visits) as total FROM daily_visits WHERE date LIKE ?').bind(`${month}%`).first();
						const totalVisits = totalVisitsResult?.total || 0;
						const topCountries = await c.env.DB.prepare('SELECT country_code, SUM(visits) as total_visits FROM daily_visits WHERE date LIKE ? GROUP BY country_code ORDER BY total_visits DESC LIMIT 20').bind(`${month}%`).all();

						// Content & Users
						const newItems = await c.env.DB.prepare('SELECT COUNT(*) as count FROM gallery_items WHERE createdAt >= ?').bind(startOfMonth).first('count');
						const newUsers = await c.env.DB.prepare('SELECT COUNT(*) as count FROM users WHERE createdAt >= ?').bind(startOfMonth).first('count');

						statsText = `📅 <b>Stats for ${periodLabel}</b>\n\n` +
									`👁️ <b>Visits:</b> ${totalVisits}\n` +
									`🖼️ <b>New Items:</b> ${newItems}\n` +
									`👥 <b>New Users:</b> ${newUsers}\n\n` +
									`🌍 <b>Top Countries:</b>\n`;

						if (topCountries.results && topCountries.results.length > 0) {
							topCountries.results.forEach((r: any, i: number) => {
								statsText += `${i+1}. <b>${r.country_code}</b>: ${r.total_visits}\n`;
							});
						} else {
							statsText += 'No visits recorded this month.';
						}
					} catch(e) { statsText = 'Error fetching monthly stats.'; }
				} else if (data === 'stats_all_time') {
					periodLabel = 'All Time';
					try {
						// Traffic
						const totalVisitsResult = await c.env.DB.prepare('SELECT SUM(visits) as total FROM country_stats').first();
						const totalVisits = totalVisitsResult?.total || 0;
						const topCountries = await c.env.DB.prepare('SELECT country_code, visits FROM country_stats ORDER BY visits DESC LIMIT 20').all();

						statsText = `📅 <b>All Time Stats</b>\n\n` +
									`👁️ <b>Total Visits:</b> ${totalVisits}\n` +
									`🖼️ <b>Total Items:</b> ${items}\n` +
									`👥 <b>Total Users:</b> ${users}\n\n` +
									`🌍 <b>Top Countries:</b>\n`;

						if (topCountries.results && topCountries.results.length > 0) {
							topCountries.results.forEach((r: any, i: number) => {
								statsText += `${i+1}. <b>${r.country_code}</b>: ${r.visits}\n`;
							});
						} else {
							statsText += 'No data available.';
						}
					} catch(e) { statsText = 'Error fetching all-time stats.'; }
				}

				if (statsText) {
					await fetch(`https://api.telegram.org/bot${telegramBotToken}/editMessageText`, {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({
							chat_id: chatId,
							message_id: messageId,
							text: statsText,
							parse_mode: 'HTML',
							reply_markup: {
								inline_keyboard: [
									[
										{ text: 'Today', callback_data: 'stats_daily' },
										{ text: 'Month', callback_data: 'stats_monthly' },
										{ text: 'All Time', callback_data: 'stats_all_time' }
									]
								]
							}
						})
					});
				}
			}

			// Answer callback query to stop loading state
			await fetch(`https://api.telegram.org/bot${telegramBotToken}/answerCallbackQuery`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ callback_query_id: callbackQuery.id })
			});
			
			return c.json({ ok: true });
		}

		// Check if it's a message and contains text
		if (update.message && update.message.text) {
			const chatId = update.message.chat.id;
			const text = update.message.text.trim();
			const parts = text.split(' ');
			const command = parts[0];
			const args = parts.slice(1).join(' ');

			const envChatIds = c.env.TELEGRAM_ADMIN_CHAT_IDS ? c.env.TELEGRAM_ADMIN_CHAT_IDS.split(',') : [];

			// Check DB for authorized IDs as well
			let dbChatIds: string[] = [];
			try {
				const { results } = await c.env.DB.prepare('SELECT chat_id FROM telegram_admins').all();
				dbChatIds = results.map((r: any) => r.chat_id);
			} catch (e) { /* Table might not exist yet */ }

			const isAuthorized = [...envChatIds, ...dbChatIds].some(id => id.trim() === chatId.toString());

			if (command === '/start') {
				const messageText = isAuthorized
					? `Connected! You are authorized.\nTry /help to see available commands.`
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
			} else if (isAuthorized) {
				// --- Authorized Admin Commands ---

				if (command === '/help') {
					const helpText = `<b>🤖 Admin Bot Commands</b>\n\n` +
						`/stats - View website statistics\n` +
						`/latest - Show most recent gallery item\n` +
						`/content - List recent content\n` +
						`/search [term] - Search gallery items\n` +
						`/users - List recent users\n` +
						`/admins - List authorized Telegram admins\n` +
						`/add_admin [id] [name] - Add new admin\n` +
						`/add_manager [user] [pass] - Add web manager\n` +
						`/remove_admin [id] - Remove admin\n` +
						`/ban_ip [ip] - Ban an IP address\n` +
						`/logs - View recent system logs\n` +
						`/status - Check system health\n` +
						`/maintenance [on/off] - Toggle maintenance mode\n` +
						`/delete_user [username] - Delete a user\n` +
						`/delete_item [id] - Delete an item by ID\n` +
						`/broadcast [msg] - Message all admins`;

					await fetch(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`, {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ chat_id: chatId, text: helpText, parse_mode: 'HTML' })
					});

				} else if (command === '/stats') {
				const items = await c.env.DB.prepare('SELECT COUNT(*) as count FROM gallery_items').first('count');
				const users = await c.env.DB.prepare('SELECT COUNT(*) as count FROM users').first('count');
				
				let overviewText = '';
				try {
					const totalVisitsResult = await c.env.DB.prepare('SELECT SUM(visits) as total FROM country_stats').first();
					const totalVisits = totalVisitsResult?.total || 0;
					const topCountries = await c.env.DB.prepare('SELECT country_code, visits FROM country_stats ORDER BY visits DESC LIMIT 5').all();
					
					overviewText = `📊 <b>Website Statistics (All Time)</b>\n\n` +
								   `🖼️ <b>Gallery Items:</b> ${items}\n` +
								   `👥 <b>Users:</b> ${users}\n` +
								   `👁️ <b>Total Visits:</b> ${totalVisits}\n\n` +
								   `🌍 <b>Top 5 Countries:</b>\n`;
					
					if (topCountries.results && topCountries.results.length > 0) {
						topCountries.results.forEach((r: any, i: number) => {
							overviewText += `${i+1}. <b>${r.country_code}</b>: ${r.visits}\n`;
						});
					} else {
						overviewText += 'N/A\n';
					}
				} catch (e) {
					overviewText = 'Stats unavailable (DB error).';
				}

				if (telegramBotToken) {
					await fetch(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`, {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({
							chat_id: chatId,
							text: `${overviewText}\n<i>Select a period below for detailed stats:</i>`,
							parse_mode: 'HTML',
							reply_markup: {
								inline_keyboard: [
									[
										{ text: 'Today', callback_data: 'stats_daily' },
										{ text: 'Month', callback_data: 'stats_monthly' },
										{ text: 'All Time', callback_data: 'stats_all_time' }
									]
								]
							}
						})
					});
				}
				} else if (command === '/latest') {
					try {
						const item: any = await c.env.DB.prepare('SELECT * FROM gallery_items ORDER BY createdAt DESC LIMIT 1').first();
						if (item) {
							await fetch(`https://api.telegram.org/bot${telegramBotToken}/sendPhoto`, {
								method: 'POST',
								headers: { 'Content-Type': 'application/json' },
								body: JSON.stringify({
									chat_id: chatId,
									photo: item.imageUrl,
									caption: `<b>Latest Item</b>\n\n<b>ID:</b> ${item.id}\n<b>Name:</b> ${item.name}\n<b>Category:</b> ${item.category}\n<b>Date:</b> ${item.createdAt}`,
									parse_mode: 'HTML'
								})
							});
						} else {
							await fetch(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`, {
								method: 'POST',
								headers: { 'Content-Type': 'application/json' },
								body: JSON.stringify({ chat_id: chatId, text: 'No items found.' })
							});
						}
					} catch (e) {
						await fetch(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`, {
							method: 'POST',
							headers: { 'Content-Type': 'application/json' },
							body: JSON.stringify({ chat_id: chatId, text: 'Error fetching latest item.' })
						});
					}
				} else if (command === '/content') {
					try {
						const { results } = await c.env.DB.prepare('SELECT id, name, category, createdAt FROM gallery_items ORDER BY createdAt DESC LIMIT 10').all();
						let msg = '<b>🖼️ Recent Content (Last 10)</b>\n\n';
						if (results && results.length > 0) {
							results.forEach((item: any) => {
								const date = item.createdAt ? new Date(item.createdAt).toLocaleDateString() : 'N/A';
								msg += `• <b>${item.name}</b> (${item.category}) - ${date}\n  ID: <code>${item.id}</code>\n`;
							});
						} else {
							msg += 'No content found.';
						}
						await fetch(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`, {
							method: 'POST',
							headers: { 'Content-Type': 'application/json' },
							body: JSON.stringify({ chat_id: chatId, text: msg, parse_mode: 'HTML' })
						});
					} catch (e) {
						await fetch(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`, {
							method: 'POST',
							headers: { 'Content-Type': 'application/json' },
							body: JSON.stringify({ chat_id: chatId, text: 'Error fetching content.' })
						});
					}
				} else if (command === '/search') {
					if (!args) {
						await fetch(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`, {
							method: 'POST',
							headers: { 'Content-Type': 'application/json' },
							body: JSON.stringify({ chat_id: chatId, text: 'Usage: /search [term]' })
						});
					} else {
						try {
							const { results } = await c.env.DB.prepare('SELECT id, name, category, affiliateUrl FROM gallery_items WHERE name LIKE ? OR description LIKE ? LIMIT 5').bind(`%${args}%`, `%${args}%`).all();
							let msg = `<b>🔍 Search Results for "${args}"</b>\n\n`;
							if (results && results.length > 0) {
								results.forEach((item: any) => {
									msg += `• <b>${item.name}</b> (${item.category})\n  ID: <code>${item.id}</code>\n  <a href="${item.affiliateUrl}">Link</a>\n\n`;
								});
							} else {
								msg += 'No items found.';
							}
							await fetch(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`, {
								method: 'POST',
								headers: { 'Content-Type': 'application/json' },
								body: JSON.stringify({ chat_id: chatId, text: msg, parse_mode: 'HTML', disable_web_page_preview: true })
							});
						} catch (e) {
							await fetch(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`, {
								method: 'POST',
								headers: { 'Content-Type': 'application/json' },
								body: JSON.stringify({ chat_id: chatId, text: 'Error searching items.' })
							});
						}
					}
				} else if (command === '/id') {
					await fetch(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`, {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ chat_id: chatId, text: `Your Chat ID: <code>${chatId}</code>`, parse_mode: 'HTML' })
					});
				} else if (command === '/status') {
					let dbStatus = 'Unknown';
					try {
						await c.env.DB.prepare('SELECT 1').first();
						dbStatus = '✅ Connected';
					} catch (e) { dbStatus = '❌ Error'; }
					
					await fetch(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`, {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ chat_id: chatId, text: `<b>System Status</b>\n\nDatabase: ${dbStatus}\nRegion: ${c.req.header('cf-ray') || 'Unknown'}`, parse_mode: 'HTML' })
					});
				} else if (command === '/logs') {
					try {
						const { results } = await c.env.DB.prepare('SELECT level, message, created_at FROM system_logs ORDER BY created_at DESC LIMIT 5').all();
						let msg = '<b>📜 Recent System Logs</b>\n\n';
						if (results && results.length > 0) {
							results.forEach((l: any) => {
								msg += `[${l.level}] ${l.message}\n<i>${l.created_at}</i>\n\n`;
							});
						} else { msg += 'No logs found.'; }
						await fetch(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`, {
							method: 'POST',
							headers: { 'Content-Type': 'application/json' },
							body: JSON.stringify({ chat_id: chatId, text: msg, parse_mode: 'HTML' })
						});
					} catch (e) {
						await fetch(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`, {
							method: 'POST',
							headers: { 'Content-Type': 'application/json' },
							body: JSON.stringify({ chat_id: chatId, text: 'Error fetching logs.' })
						});
					}
				} else if (command === '/ban_ip') {
					if (!args) {
						await fetch(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chatId, text: 'Usage: /ban_ip [ip]' }) });
					} else {
						await c.env.DB.prepare(`CREATE TABLE IF NOT EXISTS banned_ips (ip TEXT PRIMARY KEY, reason TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`).run();
						await c.env.DB.prepare('INSERT INTO banned_ips (ip, reason) VALUES (?, ?) ON CONFLICT(ip) DO NOTHING').bind(args.trim(), 'Banned via Telegram').run();
						await logEvent(c.env.DB, 'WARN', `IP ${args.trim()} banned via Telegram`);
						await fetch(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chatId, text: `🚫 IP <b>${args}</b> has been banned.`, parse_mode: 'HTML' }) });
					}
				} else if (command === '/unban_ip') {
					if (!args) {
						await fetch(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chatId, text: 'Usage: /unban_ip [ip]' }) });
					} else {
						await c.env.DB.prepare('DELETE FROM banned_ips WHERE ip = ?').bind(args.trim()).run();
						await logEvent(c.env.DB, 'INFO', `IP ${args.trim()} unbanned via Telegram`);
						await fetch(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chatId, text: `✅ IP <b>${args}</b> unbanned.`, parse_mode: 'HTML' }) });
					}
				} else if (command === '/add_admin') {
					const [newId, ...nameParts] = args.split(' ');
					const newName = nameParts.join(' ') || 'Admin';
					if (!newId) {
						await fetch(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chatId, text: 'Usage: /add_admin [id] [name]' }) });
					} else {
						try {
							await c.env.DB.prepare(`CREATE TABLE IF NOT EXISTS telegram_admins (id INTEGER PRIMARY KEY AUTOINCREMENT, chat_id TEXT NOT NULL UNIQUE, name TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`).run();
							await c.env.DB.prepare('INSERT INTO telegram_admins (chat_id, name) VALUES (?, ?)').bind(newId, newName).run();
							await logEvent(c.env.DB, 'WARN', `New Telegram Admin added: ${newId} (${newName})`);
							await fetch(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chatId, text: `✅ Admin <b>${newName}</b> (${newId}) added.`, parse_mode: 'HTML' }) });
						} catch (e) {
							await fetch(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chatId, text: 'Failed to add admin (ID might exist).' }) });
						}
					}
				} else if (command === '/remove_admin') {
					if (!args) {
						await fetch(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chatId, text: 'Usage: /remove_admin [id]' }) });
					} else {
						const info = await c.env.DB.prepare('DELETE FROM telegram_admins WHERE chat_id = ?').bind(args.trim()).run();
						if (info.changes > 0) {
							await logEvent(c.env.DB, 'WARN', `Telegram Admin removed: ${args.trim()}`);
							await fetch(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chatId, text: `🗑️ Admin <b>${args}</b> removed.`, parse_mode: 'HTML' }) });
						} else {
							await fetch(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chatId, text: `❌ Admin ID <b>${args}</b> not found.`, parse_mode: 'HTML' }) });
						}
					}
				} else if (command === '/add_manager') {
					const [newUsername, newPassword] = args.split(' ');
					if (!newUsername || !newPassword) {
						await fetch(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chatId, text: 'Usage: /add_manager [username] [password]' }) });
					} else {
						try {
							await c.env.DB.prepare('INSERT INTO users (username, passwordHash, role) VALUES (?, ?, ?)')
								.bind(newUsername, newPassword, 'manager').run();
							await logEvent(c.env.DB, 'WARN', `New manager created via Telegram: ${newUsername}`);
							await fetch(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chatId, text: `✅ Manager <b>${newUsername}</b> created.`, parse_mode: 'HTML' }) });
						} catch (e: any) {
							const errorMsg = e.message.includes('UNIQUE') ? 'Username already exists.' : 'Failed to create user.';
							await fetch(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chatId, text: `❌ ${errorMsg}` }) });
						}
					}
				} else if (command === '/maintenance') {
					const status = args.trim().toLowerCase();
					if (status === 'on' || status === 'off') {
						await c.env.DB.prepare("INSERT INTO configurations (key, value) VALUES ('maintenance_mode', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(status === 'on' ? 'true' : 'false').run();
						await fetch(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`, {
							method: 'POST',
							headers: { 'Content-Type': 'application/json' },
							body: JSON.stringify({ chat_id: chatId, text: `✅ Maintenance mode turned <b>${status.toUpperCase()}</b>.`, parse_mode: 'HTML' })
						});
					} else {
						const current = await c.env.DB.prepare("SELECT value FROM configurations WHERE key = 'maintenance_mode'").first('value');
						const isMaintenance = current === 'true';
						await fetch(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`, {
							method: 'POST',
							headers: { 'Content-Type': 'application/json' },
							body: JSON.stringify({ chat_id: chatId, text: `Maintenance mode is currently: <b>${isMaintenance ? 'ON' : 'OFF'}</b>\nUsage: /maintenance [on/off]`, parse_mode: 'HTML' })
						});
					}
				} else if (command === '/admins') {
					try {
						const { results } = await c.env.DB.prepare('SELECT name, chat_id FROM telegram_admins').all();
						let msg = '<b>🛡️ Telegram Admins</b>\n\n';
						if (results && results.length > 0) {
							results.forEach((a: any) => {
								msg += `• <b>${a.name || 'Unknown'}</b> (<code>${a.chat_id}</code>)\n`;
							});
						} else {
							msg += 'No admins in database (only env vars).';
						}
						await fetch(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`, {
							method: 'POST',
							headers: { 'Content-Type': 'application/json' },
							body: JSON.stringify({ chat_id: chatId, text: msg, parse_mode: 'HTML' })
						});
					} catch (e) {
						await fetch(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`, {
							method: 'POST',
							headers: { 'Content-Type': 'application/json' },
							body: JSON.stringify({ chat_id: chatId, text: 'Error fetching admins.' })
						});
					}
				} else if (command === '/users') {
					try {
						const { results } = await c.env.DB.prepare('SELECT username, role, createdAt FROM users ORDER BY createdAt DESC LIMIT 5').all();
						let msg = '<b>👥 Recent Users (Last 5)</b>\n\n';
						if (results && results.length > 0) {
							results.forEach((u: any) => {
								msg += `• <b>${u.username}</b> (${u.role})\n`;
							});
						} else {
							msg += 'No users found.';
						}
						await fetch(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`, {
							method: 'POST',
							headers: { 'Content-Type': 'application/json' },
							body: JSON.stringify({ chat_id: chatId, text: msg, parse_mode: 'HTML' })
						});
					} catch (e) {
						await fetch(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`, {
							method: 'POST',
							headers: { 'Content-Type': 'application/json' },
							body: JSON.stringify({ chat_id: chatId, text: 'Error fetching users.' })
						});
					}
				} else if (command === '/delete_user') {
					if (!args) {
						await fetch(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`, {
							method: 'POST',
							headers: { 'Content-Type': 'application/json' },
							body: JSON.stringify({ chat_id: chatId, text: 'Usage: /delete_user [username]' })
						});
					} else {
						const info = await c.env.DB.prepare('DELETE FROM users WHERE username = ?').bind(args.trim()).run();
						const reply = info.changes > 0 ? `✅ User <b>${args}</b> deleted.` : `❌ User <b>${args}</b> not found.`;
						await fetch(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`, {
							method: 'POST',
							headers: { 'Content-Type': 'application/json' },
							body: JSON.stringify({ chat_id: chatId, text: reply, parse_mode: 'HTML' })
						});
					}
				} else if (command === '/delete_item') {
					if (!args) {
						await fetch(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`, {
							method: 'POST',
							headers: { 'Content-Type': 'application/json' },
							body: JSON.stringify({ chat_id: chatId, text: 'Usage: /delete_item [id]' })
						});
					} else {
						const info = await c.env.DB.prepare('DELETE FROM gallery_items WHERE id = ?').bind(args.trim()).run();
						const reply = info.changes > 0 ? `✅ Item ID <b>${args}</b> deleted.` : `❌ Item ID <b>${args}</b> not found.`;
						await fetch(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`, {
							method: 'POST',
							headers: { 'Content-Type': 'application/json' },
							body: JSON.stringify({ chat_id: chatId, text: reply, parse_mode: 'HTML' })
						});
					}
				} else if (command === '/broadcast') {
					if (!args) {
						await fetch(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`, {
							method: 'POST',
							headers: { 'Content-Type': 'application/json' },
							body: JSON.stringify({ chat_id: chatId, text: 'Usage: /broadcast [message]' })
						});
					} else {
						// Send to all admins except sender
						const recipients = [...envChatIds, ...dbChatIds].filter(id => id.trim() !== chatId.toString());
						const uniqueRecipients = [...new Set(recipients)];
						
						c.executionCtx.waitUntil(Promise.all(uniqueRecipients.map(id => 
							fetch(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`, {
								method: 'POST',
								headers: { 'Content-Type': 'application/json' },
								body: JSON.stringify({
									chat_id: id.trim(),
									text: `📢 <b>Admin Broadcast</b>\n\n${args}`,
									parse_mode: 'HTML'
								})
							})
						)));
						
						await fetch(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`, {
							method: 'POST',
							headers: { 'Content-Type': 'application/json' },
							body: JSON.stringify({ chat_id: chatId, text: `✅ Broadcast sent to ${uniqueRecipients.length} admins.` })
						});
					}
				} else if (command === '/subs') {
					let count = 0;
					let cursor: string | undefined = undefined;
					let listComplete = false;
					try {
						do {
							const list = await c.env.SUBSCRIPTIONS.list({ cursor });
							count += list.keys.length;
							listComplete = list.list_complete;
							cursor = list.cursor;
						} while (!listComplete);
						
						await fetch(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`, {
							method: 'POST',
							headers: { 'Content-Type': 'application/json' },
							body: JSON.stringify({ chat_id: chatId, text: `🔔 <b>Push Subscribers:</b> ${count}`, parse_mode: 'HTML' })
						});
					} catch (e) {
						await fetch(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`, {
							method: 'POST',
							headers: { 'Content-Type': 'application/json' },
							body: JSON.stringify({ chat_id: chatId, text: 'Error fetching subscriber count.' })
						});
					}
				}
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
    const validSort = ['createdAt', 'name', 'likes', 'dislikes'].includes(sort) ? sort : 'createdAt';
    const validOrder = ['asc', 'desc'].includes(order) ? order.toUpperCase() : 'DESC';

	// Lazy migration: Ensure 'isFeatured' column exists
	try {
		await c.env.DB.prepare('ALTER TABLE gallery_items ADD COLUMN isFeatured INTEGER DEFAULT 0').run();
	} catch (e) { /* Column likely exists */ }

	// --- Visitor Tracking ---
	const country = c.req.header('cf-ipcountry') || 'Unknown';
	c.executionCtx.waitUntil((async () => {
		try {
			// Ensure table exists (lazy migration)
			await c.env.DB.prepare(`
				CREATE TABLE IF NOT EXISTS country_stats (
					country_code TEXT PRIMARY KEY,
					visits INTEGER DEFAULT 0
				)
			`).run();
			// Increment visit count for this country
			await c.env.DB.prepare(`
				INSERT INTO country_stats (country_code, visits) VALUES (?, 1)
				ON CONFLICT(country_code) DO UPDATE SET visits = visits + 1
			`).bind(country).run();

			// --- Daily stats tracking ---
			await c.env.DB.prepare(`
				CREATE TABLE IF NOT EXISTS daily_visits (
					date TEXT,
					country_code TEXT,
					visits INTEGER DEFAULT 0,
					PRIMARY KEY (date, country_code)
				)
			`).run();
			const today = new Date().toISOString().split('T')[0];
			await c.env.DB.prepare(`
				INSERT INTO daily_visits (date, country_code, visits) VALUES (?, ?, 1)
				ON CONFLICT(date, country_code) DO UPDATE SET visits = visits + 1
			`).bind(today, country).run();
		} catch (e) { console.error('Stats error:', e); }
	})());

	const stmt = c.env.DB.prepare(
		`SELECT gi.*, u.username as publisherName FROM gallery_items gi LEFT JOIN users u ON gi.userId = u.id ORDER BY gi.isFeatured DESC, ${validSort} ${validOrder}`
	);
	const { results } = await stmt.all();
	c.header('Cache-Control', 'public, max-age=60');
	return c.json(results);
});

// Like a gallery item
app.post('/api/gallery/:id/like', async (c) => {
	const id = c.req.param('id');
	
	// Lazy migration: Ensure 'likes' column exists
	try {
		await c.env.DB.prepare('ALTER TABLE gallery_items ADD COLUMN likes INTEGER DEFAULT 0').run();
	} catch (e) { /* Column likely exists */ }

	try {
		await c.env.DB.prepare('UPDATE gallery_items SET likes = COALESCE(likes, 0) + 1 WHERE id = ?').bind(id).run();
		const newItem = await c.env.DB.prepare('SELECT likes FROM gallery_items WHERE id = ?').bind(id).first();
		return c.json({ likes: newItem?.likes || 0 });
	} catch (e) {
		return c.json({ error: 'Failed to like item' }, 500);
	}
});

// Unlike a gallery item
app.delete('/api/gallery/:id/like', async (c) => {
	const id = c.req.param('id');
	try {
		await c.env.DB.prepare('UPDATE gallery_items SET likes = MAX(0, COALESCE(likes, 0) - 1) WHERE id = ?').bind(id).run();
		const newItem = await c.env.DB.prepare('SELECT likes FROM gallery_items WHERE id = ?').bind(id).first();
		return c.json({ likes: newItem?.likes || 0 });
	} catch (e) {
		return c.json({ error: 'Failed to unlike item' }, 500);
	}
});

// Dislike a gallery item
app.post('/api/gallery/:id/dislike', async (c) => {
	const id = c.req.param('id');
	
	// Lazy migration: Ensure 'dislikes' column exists
	try {
		await c.env.DB.prepare('ALTER TABLE gallery_items ADD COLUMN dislikes INTEGER DEFAULT 0').run();
	} catch (e) { /* Column likely exists */ }

	try {
		await c.env.DB.prepare('UPDATE gallery_items SET dislikes = COALESCE(dislikes, 0) + 1 WHERE id = ?').bind(id).run();
		const newItem = await c.env.DB.prepare('SELECT dislikes FROM gallery_items WHERE id = ?').bind(id).first();
		return c.json({ dislikes: newItem?.dislikes || 0 });
	} catch (e) {
		return c.json({ error: 'Failed to dislike item' }, 500);
	}
});

// Undislike a gallery item
app.delete('/api/gallery/:id/dislike', async (c) => {
	const id = c.req.param('id');
	try {
		await c.env.DB.prepare('UPDATE gallery_items SET dislikes = MAX(0, COALESCE(dislikes, 0) - 1) WHERE id = ?').bind(id).run();
		const newItem = await c.env.DB.prepare('SELECT dislikes FROM gallery_items WHERE id = ?').bind(id).first();
		return c.json({ dislikes: newItem?.dislikes || 0 });
	} catch (e) {
		return c.json({ error: 'Failed to undislike item' }, 500);
	}
});

// Get latest announcement (for website popup)
app.get('/api/announcements/latest', async (c) => {
	try {
		const now = new Date().toISOString();
		// Only fetch announcements that haven't expired
		const announcement = await c.env.DB.prepare('SELECT * FROM announcements WHERE expires_at > ? ORDER BY created_at DESC LIMIT 1').bind(now).first();
		c.header('Cache-Control', 'public, max-age=60');
		return c.json(announcement || {});
	} catch (e) {
		return c.json({});
	}
});

// --- Authenticated Routes (All roles) ---

// Add a new gallery item
app.post('/api/upload', authMiddleware, async (c) => {
	const schema = z.object({
		name: z.string().min(1),
		description: z.string().optional(),
		category: z.string().min(1),
		imageUrl: z.string().url(),
		affiliateUrl: z.string().url(),
		isFeatured: z.boolean().optional()
	});
	const body = await c.req.json();
	const result = schema.safeParse(body);
	if (!result.success) return c.json({ error: 'Invalid item data', details: result.error }, 400);
	const { name, description, category, imageUrl, affiliateUrl, isFeatured } = result.data;

	const { results } = await c.env.DB.prepare(
		'INSERT INTO gallery_items (name, description, category, isFeatured, imageUrl, affiliateUrl, userId) VALUES (?, ?, ?, ?, ?, ?, ?)'
	).bind(name, description, category, isFeatured ? 1 : 0, imageUrl, affiliateUrl, c.get('userId')).run();
	c.executionCtx.waitUntil(logEvent(c.env.DB, 'INFO', `Item added: ${name}`));

	// --- OPTIMIZATION: Run Notifications in Background ---
	const discordPromise = (async () => {
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
		} catch (e) { console.error('Failed to send Discord notification', e); }
	})();

	const telegramPromise = (async () => {
		try {
		// TODO: Replace with your actual Bot Token from @BotFather
		const telegramBotToken = await getTelegramToken(c.env); 
		// TODO: Replace with your Channel Username (e.g. @OmeFans) or Numeric Chat ID
		const telegramChatId = '@OmeFans'; 

		if (telegramBotToken) {
			await fetch(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					chat_id: telegramChatId,
					text: `NEW EXCLUSIVE🆕️🔥🔥\n🆕️CHECK OUR NEW EXCLUSIVE CONTENT ON OUR WEBSITE🔥🔥❤️\n\n<b>${category.toUpperCase()}</b>\n<b>${name}</b>\n${description || ''}\n<a href="${imageUrl}">&#8205;</a>`,
					parse_mode: 'HTML',
					disable_web_page_preview: false,
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
		} catch (e) { console.error('Failed to send Telegram notification', e); }
	})();

	c.executionCtx.waitUntil(Promise.all([discordPromise, telegramPromise]));
	return c.json({ message: 'Item added successfully!', item: results }, 201);
});

// Update a gallery item
app.put('/api/gallery/:id', authMiddleware, async (c) => {
	const itemId = c.req.param('id');
	const schema = z.object({
		name: z.string().min(1),
		description: z.string().optional(),
		category: z.string().min(1),
		imageUrl: z.string().url(),
		affiliateUrl: z.string().url(),
		isFeatured: z.boolean().optional()
	});
	const body = await c.req.json();
	const result = schema.safeParse(body);
	if (!result.success) return c.json({ error: 'Invalid item data', details: result.error }, 400);
	const { name, description, category, imageUrl, affiliateUrl, isFeatured } = result.data;

	const info = await c.env.DB.prepare(
		'UPDATE gallery_items SET name = ?, description = ?, category = ?, isFeatured = ?, imageUrl = ?, affiliateUrl = ? WHERE id = ?'
	).bind(name, description, category, isFeatured ? 1 : 0, imageUrl, affiliateUrl, itemId).run();

	if (info.changes === 0) {
		return c.json({ error: 'Item not found or no changes made' }, 404);
	}

	c.executionCtx.waitUntil(logEvent(c.env.DB, 'INFO', `Item updated: ${itemId}`));
	return c.json({ message: 'Item updated successfully!', item: info });
});

// Delete a gallery item
app.delete('/api/gallery/:id', authMiddleware, async (c) => {
    const itemId = c.req.param('id');
	const info = await c.env.DB.prepare('DELETE FROM gallery_items WHERE id = ?').bind(itemId).run();
	if (info.changes === 0) {
		return c.json({ error: 'Item not found' }, 404);
	}
	c.executionCtx.waitUntil(logEvent(c.env.DB, 'INFO', `Item deleted: ${itemId}`));
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

	c.executionCtx.waitUntil(logEvent(c.env.DB, 'WARN', `User ${userId} changed password`));
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
		c.executionCtx.waitUntil(logEvent(c.env.DB, 'WARN', `New user created: ${username}`));
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

	c.executionCtx.waitUntil(logEvent(c.env.DB, 'WARN', `User deleted: ${userIdToDelete}`));
	return c.json({ message: 'User deleted successfully!' });
});

// --- Telegram Admin Management Routes ---

adminRoutes.get('/api/users/telegram', async (c) => {
	try {
		const { results } = await c.env.DB.prepare('SELECT * FROM telegram_admins ORDER BY created_at DESC').all();
		return c.json(results);
	} catch (e) {
		return c.json([]); // Return empty if table doesn't exist
	}
});

adminRoutes.post('/api/users/telegram', async (c) => {
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

adminRoutes.delete('/api/users/telegram/:id', async (c) => {
	const id = c.req.param('id');
	await c.env.DB.prepare('DELETE FROM telegram_admins WHERE id = ?').bind(id).run();
	return c.json({ message: 'Chat ID removed' });
});

// --- Announcement Management Routes ---

// Apply Admin Middleware explicitly to these routes since they don't start with /api/users/
app.get('/api/announcements', authMiddleware, adminMiddleware, async (c) => {
	const { results } = await c.env.DB.prepare('SELECT * FROM announcements ORDER BY created_at DESC').all();
	return c.json(results);
});

app.post('/api/announcements', authMiddleware, adminMiddleware, async (c) => {
	const { title, message, duration, imageUrl, linkUrl, websiteOnly } = await c.req.json();
	if (!title || !message) return c.json({ error: 'Title and message are required' }, 400);

	// Calculate Expiration
	const now = new Date();
	let expiresAt = new Date(now);
	if (duration === '1w') expiresAt.setDate(now.getDate() + 7);
	else if (duration === '1m') expiresAt.setMonth(now.getMonth() + 1);
	else expiresAt.setDate(now.getDate() + 1); // Default to 1 day

	const expiresAtStr = expiresAt.toISOString();

	// 1. Store in DB
	await c.env.DB.prepare(`
		CREATE TABLE IF NOT EXISTS announcements (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			title TEXT,
			message TEXT,
			imageUrl TEXT,
			expires_at TEXT,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP
		)
	`).run();

	try {
		await c.env.DB.prepare('ALTER TABLE announcements ADD COLUMN expires_at TEXT').run();
	} catch (e) { /* Column likely exists */ }
	try {
		await c.env.DB.prepare('ALTER TABLE announcements ADD COLUMN imageUrl TEXT').run();
	} catch (e) { /* Column likely exists */ }
	try {
		await c.env.DB.prepare('ALTER TABLE announcements ADD COLUMN linkUrl TEXT').run();
	} catch (e) { /* Column likely exists */ }
	
	await c.env.DB.prepare('INSERT INTO announcements (title, message, expires_at, imageUrl, linkUrl) VALUES (?, ?, ?, ?, ?)').bind(title, message, expiresAtStr, imageUrl || null, linkUrl || null).run();

	if (!websiteOnly) {
	// 2. Send to Discord
	const discordWebhookUrl = await getDiscordAnnouncementWebhook(c.env);
	if (discordWebhookUrl) {
		const discordBody: any = {
			content: `@everyone\n**📢 NEW ANNOUNCEMENT**\n\n**${title}**\n${message}`
		};

		if (linkUrl) {
			discordBody.content += `\n\n🔗 ${linkUrl}`;
		}

		if (imageUrl) {
			discordBody.embeds = [{
				title: title,
				url: linkUrl || undefined,
				image: { url: imageUrl },
				color: 0x58a6ff
			}];
		}

		c.executionCtx.waitUntil(fetch(discordWebhookUrl, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(discordBody)
		}).catch(e => console.error('Discord Announcement Error:', e)));
	}

	// 3. Send to Telegram Channel (@OmeFans)
	const telegramBotToken = await getTelegramToken(c.env);
	const telegramChatId = '@OmeFans'; // Or make this configurable
	if (telegramBotToken) {
		const method = imageUrl ? 'sendPhoto' : 'sendMessage';
		const body: any = {
			chat_id: telegramChatId,
			parse_mode: 'HTML'
		};

		if (imageUrl) {
			body.photo = imageUrl;
			body.caption = `📢 <b>NEW ANNOUNCEMENT</b>\n\n<b>${title}</b>\n${message}`;
		} else {
			body.text = `📢 <b>NEW ANNOUNCEMENT</b>\n\n<b>${title}</b>\n${message}`;
		}

		if (linkUrl) {
			body.reply_markup = {
				inline_keyboard: [[
					{ text: "🔗 Visit Link", url: linkUrl }
				]]
			};
		}

		c.executionCtx.waitUntil(fetch(`https://api.telegram.org/bot${telegramBotToken}/${method}`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body)
		}).catch(e => console.error('Telegram Announcement Error:', e)));
	}
	}

	return c.json({ message: 'Announcement published successfully' });
});

app.delete('/api/announcements/:id', authMiddleware, adminMiddleware, async (c) => {
	const id = c.req.param('id');
	await c.env.DB.prepare('DELETE FROM announcements WHERE id = ?').bind(id).run();
	return c.json({ message: 'Announcement deleted' });
});

// --- Discord Webhook Management Routes ---

adminRoutes.get('/api/users/discord', async (c) => {
	try {
		const { results } = await c.env.DB.prepare('SELECT * FROM discord_webhooks ORDER BY created_at DESC').all();
		return c.json(results);
	} catch (e) {
		return c.json([]); // Return empty if table doesn't exist
	}
});

adminRoutes.post('/api/users/discord', async (c) => {
	const { url, name } = await c.req.json();
	if (!url) return c.json({ error: 'Webhook URL is required' }, 400);

	// Ensure table exists (lazy migration)
	await c.env.DB.prepare(`
		CREATE TABLE IF NOT EXISTS discord_webhooks (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			url TEXT NOT NULL UNIQUE,
			name TEXT,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP
		)
	`).run();

	try {
		await c.env.DB.prepare('INSERT INTO discord_webhooks (url, name) VALUES (?, ?)').bind(url, name).run();
		return c.json({ message: 'Webhook added successfully' });
	} catch (e: any) {
		if (e.message.includes('UNIQUE')) {
			 return c.json({ error: 'Webhook URL already exists' }, 409);
		}
		return c.json({ error: 'Failed to add Webhook' }, 500);
	}
});

adminRoutes.delete('/api/users/discord/:id', async (c) => {
	const id = c.req.param('id');
	await c.env.DB.prepare('DELETE FROM discord_webhooks WHERE id = ?').bind(id).run();
	return c.json({ message: 'Webhook removed' });
});

// --- Configuration Management Routes ---

app.use('/api/config/*', authMiddleware, adminMiddleware);

app.get('/api/config/telegram', async (c) => {
	try {
		// Only return the DB override if it exists
		const result = await c.env.DB.prepare("SELECT value FROM configurations WHERE key = 'telegram_bot_token'").first('value');
		return c.json({ token: result || '' });
	} catch (e) {
		return c.json({ token: '' });
	}
});

app.post('/api/config/telegram', async (c) => {
	const { token } = await c.req.json();
	
	// Ensure table exists
	await c.env.DB.prepare(`
		CREATE TABLE IF NOT EXISTS configurations (
			key TEXT PRIMARY KEY,
			value TEXT
		)
	`).run();

	if (token && token.trim() !== '') {
		await c.env.DB.prepare("INSERT INTO configurations (key, value) VALUES ('telegram_bot_token', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(token.trim()).run();

		// Automatically register the webhook for the new token
		try {
			const url = new URL(c.req.url);
			const webhookUrl = `${url.protocol}//${url.host}/api/webhook/telegram`;
			const response = await fetch(`https://api.telegram.org/bot${token.trim()}/setWebhook?url=${webhookUrl}`);
			const data: any = await response.json();
			
			if (!data.ok) {
				return c.json({ message: `Token saved, but Webhook error: ${data.description}` });
			}
		} catch (e) {
			console.error('Webhook registration failed:', e);
			return c.json({ message: 'Token saved, but failed to register Webhook.' });
		}

		return c.json({ message: 'Telegram settings updated and Webhook registered' });
	} else {
		await c.env.DB.prepare("DELETE FROM configurations WHERE key = 'telegram_bot_token'").run();
		return c.json({ message: 'Telegram settings cleared' });
	}
});

app.get('/api/config/discord_announcement', async (c) => {
	try {
		const result = await c.env.DB.prepare("SELECT value FROM configurations WHERE key = 'discord_webhook_announcements'").first('value');
		return c.json({ url: result || c.env.DISCORD_WEBHOOK_ANNOUNCEMENTS || '' });
	} catch (e) {
		return c.json({ url: '' });
	}
});

app.post('/api/config/discord_announcement', async (c) => {
	const { url } = await c.req.json();
	await c.env.DB.prepare(`CREATE TABLE IF NOT EXISTS configurations (key TEXT PRIMARY KEY, value TEXT)`).run();

	if (url && url.trim() !== '') {
		await c.env.DB.prepare("INSERT INTO configurations (key, value) VALUES ('discord_webhook_announcements', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(url.trim()).run();
		return c.json({ message: 'Announcement Webhook updated' });
	} else {
		await c.env.DB.prepare("DELETE FROM configurations WHERE key = 'discord_webhook_announcements'").run();
		return c.json({ message: 'Announcement Webhook cleared' });
	}
});

app.post('/api/config/discord_announcement/test', async (c) => {
	const webhookUrl = await getDiscordAnnouncementWebhook(c.env);
	if (!webhookUrl) return c.json({ error: 'No webhook URL configured.' }, 400);

	try {
		const response = await fetch(webhookUrl, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ content: '🔔 **Test Notification**\nThis is a test message from your OmeFans Admin Panel.' })
		});
		if (response.ok) return c.json({ message: 'Test message sent!' });
		else return c.json({ error: `Discord returned ${response.status}` }, 500);
	} catch (e: any) { return c.json({ error: e.message }, 500); }
});

// --- Security & Logs Routes ---

app.get('/api/logs', authMiddleware, adminMiddleware, async (c) => {
	try {
		const { results } = await c.env.DB.prepare('SELECT * FROM system_logs ORDER BY created_at DESC LIMIT 50').all();
		return c.json(results);
	} catch (e) { return c.json([]); }
});

app.get('/api/security/bans', authMiddleware, adminMiddleware, async (c) => {
	try {
		const { results } = await c.env.DB.prepare('SELECT * FROM banned_ips ORDER BY created_at DESC').all();
		return c.json(results);
	} catch (e) { return c.json([]); }
});

app.post('/api/security/bans', authMiddleware, adminMiddleware, async (c) => {
	const { ip, reason } = await c.req.json();
	if (!ip) return c.json({ error: 'IP is required' }, 400);
	
	await c.env.DB.prepare(`CREATE TABLE IF NOT EXISTS banned_ips (ip TEXT PRIMARY KEY, reason TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`).run();
	
	try {
		await c.env.DB.prepare('INSERT INTO banned_ips (ip, reason) VALUES (?, ?)').bind(ip, reason || 'Manual Ban').run();
		await logEvent(c.env.DB, 'WARN', `IP Banned: ${ip}`);
		return c.json({ message: 'IP Banned' });
	} catch (e) { return c.json({ error: 'IP already banned' }, 409); }
});

app.delete('/api/security/bans/:ip', authMiddleware, adminMiddleware, async (c) => {
	const ip = c.req.param('ip');
	await c.env.DB.prepare('DELETE FROM banned_ips WHERE ip = ?').bind(ip).run();
	await logEvent(c.env.DB, 'INFO', `IP Unbanned: ${ip}`);
	return c.json({ message: 'IP Unbanned' });
});

// --- Push Notification Routes ---

app.post('/api/notifications/subscribe', async (c) => {
	try {
		const sub = await c.req.json();
		// Store subscription in KV. Use endpoint as key to prevent duplicates.
		await c.env.SUBSCRIPTIONS.put(sub.endpoint, JSON.stringify(sub));
		return c.json({ message: 'Subscribed!' }, 201);
	} catch (e) {
		return c.json({ error: 'Failed to subscribe' }, 500);
	}
});

app.post('/api/notifications/broadcast', authMiddleware, adminMiddleware, async (c) => {
	const data = await c.req.json();
	const { title, body, url, image } = data;

	if (!c.env.VAPID_PRIVATE_KEY) {
		return c.json({ error: 'Server Error: VAPID_PRIVATE_KEY is missing in Cloudflare secrets.' }, 500);
	}

	// Configure web-push
	try {
		webpush.setVapidDetails(
			'mailto:admin@omefans.com',
			'BFW5zwtA-gigvSBijdfXKLGDur837vjKr7DYKewMI63cNL-9B4OHypQsp1oyxG1zAoxmOVqUlvJ8K1gvOW6jHWY',
			c.env.VAPID_PRIVATE_KEY
		);
	} catch (e) {
		return c.json({ error: 'Server Error: Invalid VAPID configuration.' }, 500);
	}

	// Get all subscriptions from KV (with Pagination for >1000 users)
	const notifications: Promise<void>[] = [];
	let cursor: string | undefined = undefined;
	let listComplete = false;
	let successCount = 0;
	let failureCount = 0;
	let lastError = '';

	do {
		const value = await c.env.SUBSCRIPTIONS.list({ cursor });
		listComplete = value.list_complete;
		cursor = value.cursor;

		for (const key of value.keys) {
			const subData = await c.env.SUBSCRIPTIONS.get(key.name);
			if (subData) {
				const subscription = JSON.parse(subData);
				const payload = JSON.stringify({ title, body, url, image });
				
				// Send notification
				const p = webpush.sendNotification(subscription, payload)
					.then(() => { successCount++; })
					.catch(err => {
						failureCount++;
						lastError = err.message || err.statusCode || 'Unknown Error';
						if (err.statusCode === 410 || err.statusCode === 404) {
							// Subscription is gone, delete from KV
							return c.env.SUBSCRIPTIONS.delete(key.name);
						}
						console.error('Push error', err);
					});
				notifications.push(p);
			}
		}
	} while (!listComplete);

	await Promise.all(notifications);

	if (successCount === 0 && failureCount === 0) {
		return c.json({ message: 'No subscribers found to broadcast to.' });
	}
	return c.json({ message: `Report: ${successCount} Sent, ${failureCount} Failed. Last Error: ${lastError}` });
});

app.get('/api/notifications/count', authMiddleware, async (c) => {
	const role = c.get('userRole');
	if (role !== 'admin' && role !== 'manager') {
		return c.json({ error: 'Forbidden' }, 403);
	}

	let count = 0;
	let cursor: string | undefined = undefined;
	let listComplete = false;

	try {
		do {
			const list = await c.env.SUBSCRIPTIONS.list({ cursor });
			count += list.keys.length;
			listComplete = list.list_complete;
			cursor = list.cursor;
		} while (!listComplete);
		return c.json({ count });
	} catch (e) {
		return c.json({ count: 0 });
	}
});

// --- Export the Hono app ---
export default app;