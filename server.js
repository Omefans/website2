// server.js
require('dotenv').config();
const crypto = require('crypto');
const express = require('express');
const path = require('path');
const Database = require('better-sqlite3');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

// --- Database Setup --- // Use a generic data directory from an environment variable, or default to the current directory. // This makes it work on any host (like Fly.io) that supports persistent volumes.
const dataDir = process.env.DATA_DIR || __dirname;
const dbPath = path.join(dataDir, 'database.db');
const db = new Database(dbPath);
db.exec(`
  CREATE TABLE IF NOT EXISTS gallery_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    image_path TEXT NOT NULL,
    affiliate_url TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// --- Middleware ---
app.use(cors());
app.use(express.json()); // Use express's built-in JSON parser
app.use(express.urlencoded({ extended: true }));

// --- API Routes --- // GET: Root route for health check and API status
app.get('/', (req, res) => {
    res.status(200).json({
        status: 'ok',
        message: 'Omefans API is running.'
    });
});

// GET: Fetch all gallery items (No changes needed here)
app.get('/api/gallery', (req, res) => {
    try {
        const stmt = db.prepare('SELECT id, name, description, image_path, affiliate_url, created_at FROM gallery_items ORDER BY created_at DESC');
        const items = stmt.all();
        res.json(items);
    } catch (error) {
        console.error('Failed to retrieve gallery items:', error);
        res.status(500).json({ error: 'Failed to retrieve gallery items.' });
    }
});

// POST: Add a new gallery item from a URL (Password Protected)
app.post('/api/upload', (req, res) => {
    const { password, name, description, imageUrl, affiliateUrl } = req.body;

    // Use a timing-safe comparison to protect against timing attacks.
    const userPassword = (typeof password === 'string') ? password : '';
    const storedPassBuf = Buffer.from(ADMIN_PASSWORD);
    const providedPassBuf = Buffer.from(userPassword);

    if (storedPassBuf.length !== providedPassBuf.length || !crypto.timingSafeEqual(storedPassBuf, providedPassBuf)) {
        return res.status(403).json({ error: 'Forbidden: Invalid password.' });
    }

    if (!name || !imageUrl || !affiliateUrl) {
        return res.status(400).json({ error: 'Name, Image URL, and Affiliate URL are required.' });
    }

    try {
        // The image_path is now the imageUrl provided by the admin
        const stmt = db.prepare('INSERT INTO gallery_items (name, description, image_path, affiliate_url) VALUES (?, ?, ?, ?)');
        stmt.run(name, description || '', imageUrl, affiliateUrl);
        
        res.status(201).json({ success: true, message: 'Item added successfully.' });
    } catch (error) {
        console.error('Database insertion failed:', error);
        res.status(500).json({ error: 'Database insertion failed.' });
    }
});

// DELETE: Remove a gallery item (Password Protected)
app.delete('/api/gallery/:id', (req, res) => {
    const { password } = req.body;
    const { id } = req.params;

    // Password validation
    const userPassword = (typeof password === 'string') ? password : '';
    const storedPassBuf = Buffer.from(ADMIN_PASSWORD);
    const providedPassBuf = Buffer.from(userPassword);

    if (storedPassBuf.length !== providedPassBuf.length || !crypto.timingSafeEqual(storedPassBuf, providedPassBuf)) {
        return res.status(403).json({ error: 'Forbidden: Invalid password.' });
    }

    if (!id) {
        return res.status(400).json({ error: 'Item ID is required.' });
    }

    try {
        const stmt = db.prepare('DELETE FROM gallery_items WHERE id = ?');
        const info = stmt.run(id);

        if (info.changes > 0) {
            res.status(200).json({ success: true, message: 'Item deleted successfully.' });
        } else {
            res.status(404).json({ error: 'Item not found.' });
        }
    } catch (error) {
        console.error('Database deletion failed:', error);
        res.status(500).json({ error: 'Database deletion failed.' });
    }
});

// PUT: Update a gallery item (Password Protected)
app.put('/api/gallery/:id', (req, res) => {
    const { password, name, description, imageUrl, affiliateUrl } = req.body;
    const { id } = req.params;

    // Password validation
    const userPassword = (typeof password === 'string') ? password : '';
    const storedPassBuf = Buffer.from(ADMIN_PASSWORD);
    const providedPassBuf = Buffer.from(userPassword);

    if (storedPassBuf.length !== providedPassBuf.length || !crypto.timingSafeEqual(storedPassBuf, providedPassBuf)) {
        return res.status(403).json({ error: 'Forbidden: Invalid password.' });
    }

    if (!name || !imageUrl || !affiliateUrl) {
        return res.status(400).json({ error: 'Name, Image URL, and Affiliate URL are required.' });
    }

    try {
        const stmt = db.prepare('UPDATE gallery_items SET name = ?, description = ?, image_path = ?, affiliate_url = ? WHERE id = ?');
        const info = stmt.run(name, description || '', imageUrl, affiliateUrl, id);

        if (info.changes > 0) {
            res.status(200).json({ success: true, message: 'Item updated successfully.' });
        } else {
            res.status(404).json({ error: 'Item not found.' });
        }
    } catch (error) {
        console.error('Database update failed:', error);
        res.status(500).json({ error: 'Database update failed.' });
    }
});

// --- Start Server ---
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
