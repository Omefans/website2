const AppConfig = {
    // This is the address of your local admin server
    backendUrl: 'http://localhost:8000'
};

document.addEventListener('DOMContentLoaded', () => {
    // The login form is not needed for the local tool, so we remove it.
    document.getElementById('login-form')?.remove();

    const uploadForm = document.getElementById('upload-form');
    const messageEl = document.getElementById('message');
    const managementContainer = document.getElementById('management-container');
    const itemListContainer = document.getElementById('item-list');
    const editIdInput = document.getElementById('edit-id');
    const formSubmitButton = uploadForm.querySelector('button[type="submit"]');
    const cancelEditButton = document.getElementById('cancel-edit-btn');

    let galleryItemsCache = [];

    // Make the upload and management forms visible immediately
    uploadForm.style.display = 'block';
    managementContainer.style.display = 'block';
    messageEl.textContent = 'Welcome! Add, edit, or delete items below. Your changes will be saved directly to gallery.json.';

    async function loadManageableItems() {
        try {
            const response = await fetch(`${AppConfig.backendUrl}/api/gallery`);
            if (!response.ok) {
                throw new Error(`Failed to fetch items. Status: ${response.status}`);
            }
            galleryItemsCache = await response.json();

            itemListContainer.innerHTML = ''; // Clear previous list
            if (galleryItemsCache.length === 0) {
                itemListContainer.innerHTML = '<p>gallery.json is empty. Add an item to get started.</p>';
                return;
            }

            // Sort by date, newest first, to match the public site's default
            galleryItemsCache.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

            galleryItemsCache.forEach(item => {
                const itemEl = document.createElement('div');
                itemEl.dataset.id = item.id;
                itemEl.innerHTML = `
                    <span>${item.name}</span>
                    <div class="item-actions">
                        <button class="edit-btn">Edit</button>
                        <button class="delete-btn" style="background: #dc3545;">Delete</button>
                    </div>
                `;
                itemListContainer.appendChild(itemEl);
            });

        } catch (error) {
            itemListContainer.innerHTML = `<p>Error loading items: ${error.message}. Is the local server running?</p>`;
        }
    }

    itemListContainer.addEventListener('click', (e) => {
        const target = e.target;
        const itemEl = target.closest('[data-id]');
        if (!itemEl) return;

        const itemId = itemEl.dataset.id;

        if (target.classList.contains('delete-btn')) {
            handleDelete(itemId);
        } else if (target.classList.contains('edit-btn')) {
            handleEdit(itemId);
        }
    });

    async function handleDelete(itemId) {
        if (!confirm('Are you sure you want to delete this item from gallery.json?')) return;

        try {
            const response = await fetch(`${AppConfig.backendUrl}/api/gallery/${itemId}`, {
                method: 'DELETE'
            });

            if (!response.ok) {
                const errorResult = await response.json();
                throw new Error(errorResult.error || `HTTP error! Status: ${response.status}`);
            }
            const result = await response.json();
            messageEl.textContent = result.message || 'Item deleted successfully!';
            loadManageableItems(); // Refresh the list
        } catch (error) {
            messageEl.textContent = `Error: ${error.message}`;
        }
    }

    function handleEdit(itemId) {
        const itemToEdit = galleryItemsCache.find(item => item.id == itemId);
        if (!itemToEdit) return;

        editIdInput.value = itemToEdit.id;
        document.getElementById('name').value = itemToEdit.name;
        document.getElementById('description').value = itemToEdit.description;
        document.getElementById('imageUrl').value = itemToEdit.imageUrl;
        document.getElementById('affiliateUrl').value = itemToEdit.affiliateUrl;

        formSubmitButton.textContent = 'Update Item';
        formSubmitButton.style.background = '#28a745';
        cancelEditButton.style.display = 'block';
        uploadForm.scrollIntoView({ behavior: 'smooth' });
    }

    function cancelEdit() {
        uploadForm.reset();
        editIdInput.value = '';
        formSubmitButton.textContent = 'Add Item';
        formSubmitButton.style.background = '#007bff';
        cancelEditButton.style.display = 'none';
    }

    cancelEditButton.addEventListener('click', cancelEdit);

    uploadForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const editingId = editIdInput.value;
        const isEditing = !!editingId;

        messageEl.textContent = isEditing ? 'Updating item in gallery.json...' : 'Adding new item to gallery.json...';

        const data = {
            name: document.getElementById('name').value,
            description: document.getElementById('description').value,
            imageUrl: document.getElementById('imageUrl').value,
            affiliateUrl: document.getElementById('affiliateUrl').value
        };

        if (!data.name || !data.imageUrl || !data.affiliateUrl) {
            messageEl.textContent = 'Error: Name, Image URL, and Affiliate URL are required.';
            return;
        }

        const url = isEditing ? `${AppConfig.backendUrl}/api/gallery/${editingId}` : `${AppConfig.backendUrl}/api/gallery`;
        const method = isEditing ? 'PUT' : 'POST';

        try {
            const response = await fetch(url, {
                method: method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });

            if (!response.ok) throw new Error((await response.json()).error || 'Request failed');

            const result = await response.json();
            messageEl.textContent = result.message;
            isEditing ? cancelEdit() : uploadForm.reset();
            loadManageableItems(); // Refresh the list
        } catch (error) {
            messageEl.textContent = `Error: ${error.message}`;
        }
    });

    // Initial load of items
    loadManageableItems();
});
