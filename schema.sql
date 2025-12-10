CREATE TABLE IF NOT EXISTS gallery_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    imageUrl TEXT NOT NULL,
    affiliate_url TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);