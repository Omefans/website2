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

    const loginButton = loginForm.querySelector('button[type="submit"]');

    let adminPassword = '';
    let galleryItemsCache = [];

    /**
     * Sets the loading state for a button to prevent double-clicks and provide user feedback.
     * @param {HTMLButtonElement} button The button element.
     * @param {boolean} isLoading True to show loading state, false to restore.
     * @param {string} [loadingText='Loading...'] The text to display while loading.
     */
    function setButtonLoadingState(button, isLoading, loadingText = 'Loading...') {
        button.disabled = isLoading;
        if (isLoading) {
            button.dataset.originalText = button.textContent;
            button.textContent = loadingText;
        } else {
            button.textContent = button.dataset.originalText || 'Submit';
        }
    }

    /**
     * Displays a temporary message to the user.
     * @param {string} text The message to display.
     * @param {'success' | 'error'} type The type of message, for styling.
     */
    function displayMessage(text, type = 'success') {
        messageEl.textContent = text;
        messageEl.className = type === 'success' ? 'message-success' : 'message-error';

        // Automatically clear the message after 4 seconds for better UX.
        setTimeout(() => {
            // Only clear if the message hasn't been replaced by a newer one.
            if (messageEl.textContent === text) {
                messageEl.textContent = '';
                messageEl.className = '';
            }
        }, 4000);
    }

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        adminPassword = passwordInput.value;
        setButtonLoadingState(loginButton, true, 'Authenticating...');
        try {
            const response = await fetch(`${AppConfig.backendUrl}/api/auth/check`, {
                method: 'POST',
                headers: { 'Authorization': adminPassword }
            });

            if (!response.ok) {
                const errorResult = await response.json();
                const errorMessage = errorResult.details ? `${errorResult.error}: ${errorResult.details}` : errorResult.error;
                throw new Error(errorMessage || 'Authentication failed.');
            }

            // If successful:
            loginForm.style.display = 'none';
            uploadForm.style.display = 'block';
            managementContainer.style.display = 'block';
            displayMessage('Logged in. You can now add content.', 'success');
            loadManageableItems();

        } catch (error) {
            displayMessage(`Login failed: ${error.message || 'Check credentials.'}`, 'error');
            adminPassword = ''; // Clear the invalid password
        } finally {
            setButtonLoadingState(loginButton, false);
        }
    });

    async function loadManageableItems() {
        try {
            const response = await fetch(`${AppConfig.backendUrl}/api/gallery`);
            if (!response.ok) {
                const errorText = await response.text();
                let errorMessage = `Failed to fetch items. Status: ${response.status}`;
                // Try to parse for more details
                try { const errorResult = JSON.parse(errorText); errorMessage = errorResult.details ? `${errorResult.error}: ${errorResult.details}` : errorResult.error || errorMessage; } catch (e) { /* ignore */ }
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
                    <div class="item-details">
                        <img src="${item.imageUrl}" alt="Preview" class="item-thumbnail" onerror="this.style.display='none'">
                        <span class="item-name">${item.name || 'Untitled Item'}</span>
                    </div>
                    <div class="item-actions">
                        <button type="button" class="edit-btn">Edit</button>
                        <button type="button" class="delete-btn">Delete</button>
                    </div>
                `;
                itemListContainer.appendChild(itemEl);
            });

        } catch (error) {
            itemListContainer.innerHTML = `<p class="error-message">Error loading items: ${error.message}</p>`;
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
                    const errorMessage = errorResult.details ? `${errorResult.error}: ${errorResult.details}` : errorResult.error;
                    throw new Error(errorMessage || `HTTP error! Status: ${response.status}`);
                }
                throw new Error(`Server returned an unexpected response. Status: ${response.status}.`);
            }
            const result = await response.json();
            displayMessage(result.message || 'Item deleted successfully!', 'success');
            loadManageableItems(); // Refresh the list
        } catch (error) {
            displayMessage(`Deletion failed: ${error.message}`, 'error');
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
        formSubmitButton.classList.add('btn-update');
        cancelEditButton.style.display = 'block';
        uploadForm.scrollIntoView({ behavior: 'smooth' });
    }

    function cancelEdit() {
        uploadForm.reset();
        editIdInput.value = '';
        formSubmitButton.textContent = 'Add Item';
        formSubmitButton.classList.remove('btn-update');
        cancelEditButton.style.display = 'none';
    }

    cancelEditButton.addEventListener('click', cancelEdit);

    uploadForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const editingId = editIdInput.value;
        const isEditing = !!editingId;

        const loadingText = isEditing ? 'Updating...' : 'Adding...';
        setButtonLoadingState(formSubmitButton, true, loadingText);
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
                const errorMessage = errorResult.details ? `${errorResult.error}: ${errorResult.details}` : errorResult.error;
                throw new Error(errorMessage || `HTTP error! Status: ${response.status}`);
            }

            const result = await response.json();
            displayMessage(result.message, 'success');
            isEditing ? cancelEdit() : uploadForm.reset();
            loadManageableItems(); // Refresh the list
        } catch (error) {
            displayMessage(`${isEditing ? 'Update failed' : 'Add failed'}: ${error.message}`, 'error');
        } finally {
            setButtonLoadingState(formSubmitButton, false);
        }
    });
});
