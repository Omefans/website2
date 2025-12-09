// server.js
require('dotenv').config();
const crypto = require('crypto');
const express = require('express');
const Database = require('better-sqlite3');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

// --- Database Setup ---
const db = new Database('database.db');
db.exec(`
  CREATE TABLE IF NOT EXISTS gallery_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    image_path TEXT NOT NULL,
    affiliate_url TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// --- Middleware ---
app.use(cors());
app.use(express.json()); // Use express's built-in JSON parser
app.use(express.urlencoded({ extended: true }));

// --- API Routes ---

// GET: Fetch all gallery items (No changes needed here)
app.get('/api/gallery', (req, res) => {
    try {
        const stmt = db.prepare('SELECT image_path, affiliate_url FROM gallery_items ORDER BY created_at DESC');
        const items = stmt.all();
        res.json(items);
    } catch (error) {
        console.error('Failed to retrieve gallery items:', error);
        res.status(500).json({ error: 'Failed to retrieve gallery items.' });
    }
});

// POST: Add a new gallery item from a URL (Password Protected)
app.post('/api/upload', (req, res) => {
    const { password, imageUrl, affiliateUrl } = req.body;

    // Use a timing-safe comparison to protect against timing attacks.
    const userPassword = (typeof password === 'string') ? password : '';
    const storedPassBuf = Buffer.from(ADMIN_PASSWORD);
    const providedPassBuf = Buffer.from(userPassword);

    if (storedPassBuf.length !== providedPassBuf.length || !crypto.timingSafeEqual(storedPassBuf, providedPassBuf)) {
        return res.status(403).json({ error: 'Forbidden: Invalid password.' });
    }

    if (!imageUrl || !affiliateUrl) {
        return res.status(400).json({ error: 'Image URL and affiliate URL are required.' });
    }

    try {
        // The image_path is now the imageUrl provided by the admin
        const stmt = db.prepare('INSERT INTO gallery_items (image_path, affiliate_url) VALUES (?, ?)');
        stmt.run(imageUrl, affiliateUrl);
        
        res.status(201).json({ success: true, message: 'Item added successfully.' });
    } catch (error) {
        console.error('Database insertion failed:', error);
        res.status(500).json({ error: 'Database insertion failed.' });
    }
});

// --- Start Server ---
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
