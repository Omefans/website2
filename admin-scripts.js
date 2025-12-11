const AppConfig = {
    // The live URL for the Cloudflare Worker backend.
    backendUrl: 'https://omefans-site.omefans.workers.dev'
};

document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('login-form');
    const uploadForm = document.getElementById('upload-form');
    const passwordInput = document.getElementById('password');
    const messageEl = document.getElementById('message');
    const managementContainer = document.getElementById('management-container');
    const itemListContainer = document.getElementById('item-list');
    const editIdInput = document.getElementById('edit-id');
    const formSubmitButton = uploadForm.querySelector('button[type="submit"]');
    const cancelEditButton = document.getElementById('cancel-edit-btn');

    let adminPassword = '';
    let galleryItemsCache = [];

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        adminPassword = passwordInput.value;
        messageEl.textContent = 'Authenticating...';

        try {
            const response = await fetch(`${AppConfig.backendUrl}/api/auth/check`, {
                method: 'POST',
                headers: { 'Authorization': adminPassword }
            });

            if (!response.ok) {
                const errorResult = await response.json();
                throw new Error(errorResult.error || 'Authentication failed.');
            }

            // If successful:
            loginForm.style.display = 'none';
            uploadForm.style.display = 'block';
            managementContainer.style.display = 'block';
            messageEl.textContent = 'Logged in. You can now add content.';
            loadManageableItems();

        } catch (error) {
            messageEl.textContent = `Login failed: ${error.message}`;
            adminPassword = ''; // Clear the invalid password
        }
    });

    async function loadManageableItems() {
        try {
            const response = await fetch(`${AppConfig.backendUrl}/api/gallery`);
            if (!response.ok) {
                const errorText = await response.text();
                let errorMessage = `Failed to fetch items. Status: ${response.status}`;
                try { errorMessage += ` - ${JSON.parse(errorText).error}`; } catch (e) { /* ignore */ }
                throw new Error(errorMessage);
            }
            galleryItemsCache = await response.json();

            itemListContainer.innerHTML = ''; // Clear previous list
            if (galleryItemsCache.length === 0) {
                itemListContainer.innerHTML = '<p>No items to manage yet.</p>';
                return;
            }

            galleryItemsCache.forEach(item => {
                const itemEl = document.createElement('div');
                itemEl.dataset.id = item.id;
                itemEl.innerHTML = `
                    <span>${item.name || 'Untitled Item'}</span>
                    <div class="item-actions">
                        <button class="edit-btn">Edit</button>
                        <button class="delete-btn" style="background: #dc3545;">Delete</button>
                    </div>
                `;
                itemListContainer.appendChild(itemEl);
            });

        } catch (error) {
            itemListContainer.innerHTML = `<p>Error: ${error.message}</p>`;
        }
    }

    itemListContainer.addEventListener('click', (e) => {
        const target = e.target;
        const itemEl = target.closest('[data-id]');
        if (!itemEl) return;

        const itemId = itemEl.dataset.id;

        if (target.classList.contains('delete-btn')) handleDelete(itemId);
        else if (target.classList.contains('edit-btn')) handleEdit(itemId);
    });

    async function handleDelete(itemId) {
        if (!confirm('Are you sure you want to delete this item?')) return;

        try {
            const response = await fetch(`${AppConfig.backendUrl}/api/gallery/${itemId}`, {
                method: 'DELETE',
                headers: { 'Authorization': adminPassword }
            });

            if (!response.ok) {
                if (response.headers.get('content-type')?.includes('application/json')) {
                    const errorResult = await response.json();
                    throw new Error(errorResult.error || `HTTP error! Status: ${response.status}`);
                }
                throw new Error(`Server returned an unexpected response. Status: ${response.status}.`);
            }
            const result = await response.json();
            messageEl.textContent = result.message || 'Item deleted successfully!';
            loadManageableItems(); // Refresh the list
        } catch (error) {
            messageEl.textContent = `Error: ${error.message}`;
        }
    }

    function handleEdit(itemId) {
        // Use strict equality (===) and parseInt for robust type-safe comparison.
        const numericItemId = parseInt(itemId, 10);
        const itemToEdit = galleryItemsCache.find(item => item.id === numericItemId);
        if (!itemToEdit) return;

        editIdInput.value = itemToEdit.id;
        document.getElementById('name').value = itemToEdit.name || '';
        document.getElementById('description').value = itemToEdit.description || '';
        document.getElementById('imageUrl').value = itemToEdit.imageUrl || '';
        document.getElementById('affiliateUrl').value = itemToEdit.affiliateUrl || '';

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

        messageEl.textContent = isEditing ? 'Updating content...' : 'Adding content...';
        
        const data = {
            name: document.getElementById('name').value,
            description: document.getElementById('description').value,
            imageUrl: document.getElementById('imageUrl').value,
            affiliateUrl: document.getElementById('affiliateUrl').value
        };

        const url = isEditing ? `${AppConfig.backendUrl}/api/gallery/${editingId}` : `${AppConfig.backendUrl}/api/upload`;
        const method = isEditing ? 'PUT' : 'POST';

        try {
            const response = await fetch(url, {
                method: method,
                headers: { 'Authorization': adminPassword, 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });

            if (!response.ok) {
                const errorResult = await response.json();
                throw new Error(errorResult.error || `HTTP error! Status: ${response.status}`);
            }

            const result = await response.json();
            messageEl.textContent = result.message;
            isEditing ? cancelEdit() : uploadForm.reset();
            loadManageableItems(); // Refresh the list
        } catch (error) {
            messageEl.textContent = `Error: ${error.message}`;
            console.error(error);
        }
    });
});
