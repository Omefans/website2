import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import * as fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = new Hono();
const galleryFilePath = path.join(__dirname, 'gallery.json');

// --- Helper Functions to Read/Write JSON ---
async function readGallery() {
  try {
    const data = await fs.readFile(galleryFilePath, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    if (error.code === 'ENOENT') return []; // If file doesn't exist, start with empty array
    throw error;
  }
}

async function writeGallery(data) {
  // Pretty-print the JSON with 2 spaces for readability
  await fs.writeFile(galleryFilePath, JSON.stringify(data, null, 2), 'utf-8');
}

// --- API Endpoints for the Admin Panel ---

// GET /api/gallery - Read all items
app.get('/api/gallery', async (c) => {
  const gallery = await readGallery();
  return c.json(gallery);
});

// POST /api/gallery - Add a new item
app.post('/api/gallery', async (c) => {
  const newItemData = await c.json();
  const gallery = await readGallery();

  const newId = gallery.length > 0 ? Math.max(...gallery.map(item => item.id)) + 1 : 1;
  const newItem = {
    ...newItemData,
    id: newId,
    createdAt: new Date().toISOString(),
  };

  gallery.unshift(newItem); // Add new item to the top of the list
  await writeGallery(gallery);
  return c.json({ success: true, message: 'Item added successfully.' }, 201);
});

// PUT /api/gallery/:id - Update an existing item
app.put('/api/gallery/:id', async (c) => {
    const id = parseInt(c.req.param('id'), 10);
    const updatedItemData = await c.json();
    const gallery = await readGallery();
    const itemIndex = gallery.findIndex(item => item.id === id);

    if (itemIndex === -1) return c.json({ error: 'Item not found.' }, 404);

    gallery[itemIndex] = { ...gallery[itemIndex], ...updatedItemData, id: id };
    await writeGallery(gallery);
    return c.json({ success: true, message: 'Item updated successfully.' });
});

// DELETE /api/gallery/:id - Delete an item
app.delete('/api/gallery/:id', async (c) => {
    const id = parseInt(c.req.param('id'), 10);
    let gallery = await readGallery();
    const newGallery = gallery.filter(item => item.id !== id);

    if (newGallery.length === gallery.length) return c.json({ error: 'Item not found.' }, 404);

    await writeGallery(newGallery);
    return c.json({ success: true, message: 'Item deleted successfully.' });
});

// --- Static File Server ---
app.use('/*', serveStatic({ root: './' }));

const port = 8000;
console.log(`
--------------------------------------------------
  Local Admin Server is running!
  Open your browser and go to: http://localhost:${port}/admin.html
  To stop the server, press Ctrl+C in this terminal.
--------------------------------------------------
`);

serve({
  fetch: app.fetch,
  port,
});