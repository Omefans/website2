const AppConfig = {
    // This is the address of your local admin server
    backendUrl: '' // This will be your new backend URL
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
        
        // Backend functionality has been removed.
        messageEl.textContent = 'Backend functionality is disabled.';
        // You can re-enable the forms for UI testing if needed by uncommenting the lines below.
        // loginForm.style.display = 'none';
        // uploadForm.style.display = 'block';
        // managementContainer.style.display = 'block';
    });

    async function loadManageableItems() {
        // Backend functionality has been removed.
        itemListContainer.innerHTML = '<p>Backend functionality is disabled. Cannot load items.</p>';
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

        // Backend functionality has been removed.
        messageEl.textContent = 'Backend functionality is disabled. Cannot delete item.';
    }

    function handleEdit(itemId) {
        const itemToEdit = galleryItemsCache.find(item => item.id == itemId); // Use == for type coercion if needed
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
            password: adminPassword,
            name: document.getElementById('name').value,
            description: document.getElementById('description').value,
            imageUrl: document.getElementById('imageUrl').value,
            affiliateUrl: document.getElementById('affiliateUrl').value
        };

        if (!data.name || !data.imageUrl || !data.affiliateUrl) {
            messageEl.textContent = 'Validation Error: Name, Image URL, and Affiliate URL are required.';
            return;
        }

        // Backend functionality has been removed.
        messageEl.textContent = 'Backend functionality is disabled. Cannot add or update item.';
    });
});
