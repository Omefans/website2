const AppConfig = {
    // IMPORTANT: Replace this URL with your actual Render backend URL.
    backendUrl: 'https://api.omefans.com'
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

    loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        adminPassword = passwordInput.value;
        if (adminPassword) {
            loginForm.style.display = 'none';
            uploadForm.style.display = 'block';
            managementContainer.style.display = 'block';
            messageEl.textContent = 'Logged in. You can now add content.';
            loadManageableItems();
        }
    });

    async function loadManageableItems() {
        try {
            const response = await fetch(`${AppConfig.backendUrl}/api/gallery`);
            if (!response.ok) throw new Error('Failed to fetch items.');
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
                    <span>${item.name}</span>
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

        if (target.classList.contains('delete-btn')) {
            handleDelete(itemId);
        } else if (target.classList.contains('edit-btn')) {
            handleEdit(itemId);
        }
    });

    async function handleDelete(itemId) {
        if (!confirm('Are you sure you want to delete this item?')) return;

        try {
            const response = await fetch(`${AppConfig.backendUrl}/api/gallery/${itemId}`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password: adminPassword })
            });

            if (!response.ok) {
                // If the server sends a JSON error, it will have this content-type
                if (response.headers.get('content-type')?.includes('application/json')) {
                    const errorResult = await response.json();
                    throw new Error(errorResult.error || `HTTP error! Status: ${response.status}`);
                }
                // Otherwise, it's likely an HTML error page (like a 404)
                throw new Error(`Server returned an unexpected response. Status: ${response.status}. Make sure the backend is deployed with the latest code.`);
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
        document.getElementById('imageUrl').value = itemToEdit.image_path;
        document.getElementById('affiliateUrl').value = itemToEdit.affiliate_url;

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
            password: adminPassword,
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
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(data),
            });

            if (!response.ok) {
                if (response.headers.get('content-type')?.includes('application/json')) {
                    const errorResult = await response.json();
                    throw new Error(errorResult.error || `HTTP error! Status: ${response.status}`);
                }
                // This will catch the "not valid JSON" error because the server sent an HTML 404 page.
                throw new Error(`Server returned an unexpected response. Status: ${response.status}. Make sure the backend is deployed with the latest code.`);
            }

            const result = await response.json();
            messageEl.textContent = result.message;
            if (isEditing) {
                cancelEdit();
            } else {
                uploadForm.reset();
            }
            loadManageableItems(); // Refresh the list
        } catch (error) {
            messageEl.textContent = `Error: ${error.message}`;
            console.error(error);
        }
    });
});
                messageEl.textContent = result.message;
                if (isEditing) {
                    cancelEdit();
                } else {
                    uploadForm.reset();
                }
                loadManageableItems(); // Refresh the list
            } else {
                throw new Error(result.error || 'Failed to add content.');
            }
        } catch (error) {
            messageEl.textContent = `Error: ${error.message}`;
            console.error(error);
        }
    });
});
