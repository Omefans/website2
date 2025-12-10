CREATE TABLE IF NOT EXISTS gallery_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    image_path TEXT NOT NULL, -- Changed from image_path to match worker code
    affiliate_url TEXT NOT NULL, -- Changed from affiliate_url to match worker code
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);