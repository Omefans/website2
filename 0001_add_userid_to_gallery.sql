-- This is a non-destructive migration to add the userId column to the gallery_items table.
ALTER TABLE gallery_items ADD COLUMN userId INTEGER REFERENCES users(id) ON DELETE SET NULL;