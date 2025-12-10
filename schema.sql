CREATE TABLE IF NOT EXISTS gallery_items (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    "imageUrl" TEXT NOT NULL,
    "affiliateUrl" TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);