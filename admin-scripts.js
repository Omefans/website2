const AppConfig = {
    // The live URL for the Cloudflare Worker backend.
    backendUrl: 'https://omefans-site.omefans.workers.dev'
};

document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('login-form');
    const uploadForm = document.getElementById('upload-form');
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');
    const managementContainer = document.getElementById('management-container');
    const itemListContainer = document.getElementById('item-list');
    const editIdInput = document.getElementById('edit-id');
    const formSubmitButton = uploadForm.querySelector('button[type="submit"]');
    const cancelEditButton = document.getElementById('cancel-edit-btn');
    const logoutButton = document.getElementById('logout-btn');

    // New UI elements for tabbed navigation
    const adminPanelMain = document.getElementById('admin-panel-main');
    const contentManagementSection = document.getElementById('content-management-section');
    const userManagementContainer = document.getElementById('user-management-container');
    const navContentBtn = document.getElementById('nav-content-btn');
    const navUsersBtn = document.getElementById('nav-users-btn');
    const addUserForm = document.getElementById('add-user-form');
    const userList = document.getElementById('user-list');

    const loginButton = loginForm.querySelector('button[type="submit"]');

    let galleryItemsCache = [];
    let currentSearchTerm = '';
    let currentSort = {
        field: 'createdAt', // 'createdAt' or 'name'
        order: 'desc'       // 'asc' or 'desc'
    };

    let authToken = localStorage.getItem('authToken');
    let userRole = '';
    let currentUserId = null;

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
     * Initializes a container for toast notifications if it doesn't exist.
     */
    function initToastContainer() {
        if (!document.getElementById('toast-container')) {
            const container = document.createElement('div');
            container.id = 'toast-container';
            document.body.appendChild(container);
        }
    }

    /**
     * Displays a temporary pop-up "toast" notification.
     * @param {string} text The message to display.
     * @param {'success' | 'error'} type The type of message, for styling.
     */
    function showToast(text, type = 'success') {
        const toastContainer = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;

        const icon = type === 'success'
            ? `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`
            : `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>`;

        toast.innerHTML = `${icon}<span>${text}</span>`;
        toastContainer.appendChild(toast);

        // Animate in
        setTimeout(() => toast.classList.add('show'), 100);

        // Animate out and remove after a delay
        setTimeout(() => {
            toast.classList.remove('show');
            toast.addEventListener('transitionend', () => toast.remove());
        }, 4000);
    }

    initToastContainer();

    /**
     * A wrapper around fetch that adds the auth token and handles 401 errors by logging out.
     * @param {string} url The URL to fetch.
     * @param {RequestInit} options The options for the fetch request.
     * @returns {Promise<Response>} The fetch response.
     */
    async function authenticatedFetch(url, options = {}) {
        const headers = {
            ...options.headers,
            'Authorization': `Bearer ${authToken}`,
            'Content-Type': 'application/json',
        };

        const response = await fetch(url, { ...options, headers });

        if (response.status === 401) {
            showToast('Session expired. Please log in again.', 'error');
            // Use a short delay to allow the user to see the toast before reloading.
            setTimeout(logout, 1500);
            // Throw an error to stop the execution of the calling function.
            throw new Error('Unauthorized');
        }

        return response;
    }

    // Add listeners for the new page navigation
    navContentBtn.addEventListener('click', () => showPage('content'));
    navUsersBtn.addEventListener('click', () => showPage('users'));

    // Check if a token exists on page load
    if (authToken) {
        try {
            const payload = decodeJwt(authToken);
            if (!payload || payload.exp * 1000 < Date.now()) {
                throw new Error("Token is expired or invalid.");
            }
            userRole = payload.role;
            currentUserId = payload.sub;
            showLoggedInState();
        } catch (e) {
            console.error("Invalid or expired token found:", e.message);
            logout(); // This will clear the bad token
        }
    }

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = usernameInput.value;
        const password = passwordInput.value;
        setButtonLoadingState(loginButton, true, 'Authenticating...');
        try {
            const response = await fetch(`${AppConfig.backendUrl}/api/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });

            if (!response.ok) {
                const errorResult = await response.json();
                throw new Error(errorResult.error || 'Authentication failed.');
            }

            const { token } = await response.json();
            authToken = token;
            localStorage.setItem('authToken', token);
            const payload = decodeJwt(token);
            userRole = payload.role;
            currentUserId = payload.sub;

            showLoggedInState();

        } catch (error) {
            showToast(`Login failed: ${error.message || 'Check credentials.'}`, 'error');
        } finally {
            setButtonLoadingState(loginButton, false);
        }
    });

    // Add event listeners for the user management section.
    // These are crucial for the 'Users' page functionality.
    if (addUserForm) {
        addUserForm.addEventListener('submit', handleAddUser);
    }
    if (userList) {
        userList.addEventListener('click', (e) => {
            if (e.target.classList.contains('delete-user-btn')) {
                const userId = e.target.dataset.userId;
                if (userId) handleDeleteUser(userId);
            }
        });
    }

    function showLoggedInState() {
        document.body.classList.add('logged-in');
        showToast('Login successful!', 'success');

        // Default to the content page view
        showPage('content');

        if (userRole === 'admin') {
            // A class on the body will control UI visibility via CSS
            document.body.classList.add('is-admin');
            loadUsers(); // Load user data in the background
        }

        // Inject search and sort controls if they don't exist
        if (!document.getElementById('admin-controls')) {
            const controlsHtml = `
                <div id="admin-controls" class="admin-controls">
                    <div class="search-wrapper">
                        <input type="search" id="admin-search-bar" placeholder="Search items by name...">
                    </div>
                    <div class="sort-buttons">
                        <span>Sort by:</span>
                        <button id="admin-sort-date-btn" class="sort-btn"></button>
                        <button id="admin-sort-name-btn" class="sort-btn"></button>
                    </div>
                </div>
            `;
            managementContainer.insertAdjacentHTML('afterbegin', controlsHtml);
            addControlListeners();
        }
        // Set initial sort and load data
        setSort('createdAt');
    }

    function addControlListeners() {
        document.getElementById('admin-search-bar').addEventListener('input', (e) => {
            currentSearchTerm = e.target.value.toLowerCase();
            renderItems();
        });

        document.getElementById('admin-sort-date-btn').addEventListener('click', () => setSort('createdAt'));
        document.getElementById('admin-sort-name-btn').addEventListener('click', () => setSort('name'));
    }

    function setSort(sortType) {
        if (currentSort.field === sortType) {
            // If clicking the same sort field, toggle the order
            currentSort.order = currentSort.order === 'desc' ? 'asc' : 'desc';
        } else {
            // If switching to a new sort field, set a default order
            currentSort.field = sortType;
            currentSort.order = sortType === 'createdAt' ? 'desc' : 'asc';
        }
        updateSortButtonUI();
        loadManageableItems();
    }

    function updateSortButtonUI() {
        const dateBtn = document.getElementById('admin-sort-date-btn');
        const nameBtn = document.getElementById('admin-sort-name-btn');

        // Reset both buttons
        dateBtn.innerHTML = 'Date';
        nameBtn.innerHTML = 'Name';
        dateBtn.classList.remove('active');
        nameBtn.classList.remove('active');

        if (currentSort.field === 'createdAt') {
            dateBtn.classList.add('active');
            dateBtn.innerHTML = `Date ${currentSort.order === 'desc' ? '&#9660;' : '&#9650;'}`; // ▼ or ▲
        } else { // name
            nameBtn.classList.add('active');
            nameBtn.innerHTML = `Name ${currentSort.order === 'asc' ? 'A-Z' : 'Z-A'}`;
        }
    }

    async function loadManageableItems() {
        const url = new URL(`${AppConfig.backendUrl}/api/gallery`);
        url.searchParams.set('sort', currentSort.field);
        url.searchParams.set('order', currentSort.order);

        try {
            const response = await fetch(url.toString());
            if (!response.ok) {
                const errorText = await response.text();
                let errorMessage = `Failed to fetch items. Status: ${response.status}`;
                // Try to parse for more details
                try { const errorResult = JSON.parse(errorText); errorMessage = errorResult.details ? `${errorResult.error}: ${errorResult.details}` : errorResult.error || errorMessage; } catch (e) { /* ignore */ }
                throw new Error(errorMessage);
            }
            galleryItemsCache = await response.json();
            renderItems();
        } catch (error) {
            itemListContainer.innerHTML = `<p class="error-message">Error loading items: ${error.message}</p>`;
        }
    }

    function renderItems() {
        let itemsToDisplay = [...galleryItemsCache];

        // 1. Filter by search term
        if (currentSearchTerm) {
            itemsToDisplay = itemsToDisplay.filter(item => 
                item.name.toLowerCase().includes(currentSearchTerm)
            );
        }

        itemListContainer.innerHTML = ''; // Clear previous list
        if (itemsToDisplay.length === 0) {
            const message = currentSearchTerm ? 'No items match your search.' : 'No items to manage yet.';
            itemListContainer.innerHTML = `<p>${message}</p>`;
            return;
        }

        itemsToDisplay.forEach(item => {
            const createdAt = new Date(item.createdAt);
            const formattedDate = createdAt.toLocaleDateString('en-US', {
                year: 'numeric', month: 'short', day: 'numeric'
            });

            const itemEl = document.createElement('div');
            itemEl.className = 'admin-item-card';
            itemEl.dataset.id = item.id;
            itemEl.innerHTML = `
                <img src="${item.imageUrl}" alt="Preview" class="item-card-image" onerror="this.style.display='none'">
                <div class="item-card-content">
                    <div class="item-card-header">
                        <span class="item-name">${item.name || 'Untitled Item'}</span>
                        <div class="item-meta">
                            <span class="item-category" style="color: #58a6ff; text-transform: capitalize; font-weight: 600;">${item.category || 'General'}</span>
                            <span class="item-date">${formattedDate}</span>
                        </div>
                        <div class="item-meta" style="margin-top: 2px;">
                            <span class="item-publisher">by ${item.publisherName || 'Unknown'}</span>
                        </div>
                    </div>
                    <div class="item-actions">
                        <button type="button" class="edit-btn">Edit</button>
                        <button type="button" class="delete-btn">Delete</button>
                    </div>
                </div>
            `;
            itemListContainer.appendChild(itemEl);
        });
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
            const response = await authenticatedFetch(`${AppConfig.backendUrl}/api/gallery/${itemId}`, { method: 'DELETE' });

            if (!response.ok) {
                if (response.headers.get('content-type')?.includes('application/json')) {
                    const errorResult = await response.json();
                    const errorMessage = errorResult.details ? `${errorResult.error}: ${errorResult.details}` : errorResult.error;
                    throw new Error(errorMessage || `HTTP error! Status: ${response.status}`);
                }
                throw new Error(`Server returned an unexpected response. Status: ${response.status}.`);
            }
            const result = await response.json();
            showToast(result.message || 'Item deleted successfully!', 'success');
            loadManageableItems(); // Refresh the list
        } catch (error) {
            showToast(`Deletion failed: ${error.message}`, 'error');
        }
    }

    function handleEdit(itemId) {
        // Use loose equality to match string or number IDs
        const itemToEdit = galleryItemsCache.find(item => item.id == itemId);
        if (!itemToEdit) return;

        editIdInput.value = itemToEdit.id;
        document.getElementById('name').value = itemToEdit.name || '';
        
        // Robust category selection: Normalize the value and check if it exists in the dropdown
        let categoryToSelect = 'omegle'; // Default fallback
        if (itemToEdit.category) {
            const normalized = itemToEdit.category.toString().toLowerCase().trim();
            const select = document.getElementById('category');
            if (select) {
                // Check if this value is actually a valid option
                const optionExists = Array.from(select.options).some(opt => opt.value === normalized);
                if (optionExists) categoryToSelect = normalized;
            }
        }
        if (document.getElementById('category')) document.getElementById('category').value = categoryToSelect;
        
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
        
        const categoryEl = document.getElementById('category');
        const data = {
            name: document.getElementById('name').value,
            category: categoryEl ? categoryEl.value : 'omegle',
            description: document.getElementById('description').value,
            imageUrl: document.getElementById('imageUrl').value,
            affiliateUrl: document.getElementById('affiliateUrl').value
        };

        // Revert to /api/upload for creating new items, as /api/gallery (POST) does not exist on the backend
        const url = isEditing ? `${AppConfig.backendUrl}/api/gallery/${editingId}` : `${AppConfig.backendUrl}/api/upload`;
        const method = isEditing ? 'PUT' : 'POST';

        try {
            const response = await authenticatedFetch(url, { method, body: JSON.stringify(data) });
            
            if (!response.ok) {
                const contentType = response.headers.get('content-type');
                if (contentType && contentType.includes('application/json')) {
                    const errorResult = await response.json();
                    const errorMessage = errorResult.details ? `${errorResult.error}: ${errorResult.details}` : errorResult.error;
                    throw new Error(errorMessage || `HTTP error! Status: ${response.status}`);
                } else {
                    throw new Error(`Server error ${response.status}: ${await response.text()}`);
                }
            }

            const result = await response.json();
            showToast(result.message, 'success');
            isEditing ? cancelEdit() : uploadForm.reset();
            loadManageableItems(); // Refresh the list
        } catch (error) {
            showToast(`${isEditing ? 'Update failed' : 'Add failed'}: ${error.message}`, 'error');
        } finally {
            setButtonLoadingState(formSubmitButton, false);
        }
    });

    async function handleAddUser(e) {
        e.preventDefault();
        const form = e.target;
        const button = form.querySelector('button[type="submit"]');
        const username = document.getElementById('new-username').value;
        const password = document.getElementById('new-password').value;
        const role = document.getElementById('new-role').value;

        setButtonLoadingState(button, true, 'Creating...');
        try {
            const response = await authenticatedFetch(`${AppConfig.backendUrl}/api/users`, { method: 'POST', body: JSON.stringify({ username, password, role }) });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || 'Failed to create user.');

            showToast(result.message, 'success');
            form.reset();
            loadUsers(); // Refresh the user list
        } catch (error) {
            showToast(`Error: ${error.message}`, 'error');
        } finally {
            setButtonLoadingState(button, false);
        }
    }

    async function loadUsers() {
        if (!userList) return;
    
        try {
            const response = await authenticatedFetch(`${AppConfig.backendUrl}/api/users`);
            if (!response.ok) {
                const errorResult = await response.json();
                throw new Error(errorResult.error || 'Failed to fetch users.');
            }
            const users = await response.json();
            userList.innerHTML = ''; // Clear list
    
            if (users.length === 0) {
                userList.innerHTML = '<p>No users found.</p>';
                return;
            }
    
            users.forEach(user => {
                const userEl = document.createElement('div');
                userEl.className = 'user-list-item';
                const createdAt = new Date(user.createdAt).toLocaleDateString('en-US', {
                    year: 'numeric', month: 'short', day: 'numeric'
                });
    
                // Prevent admin from deleting themselves
                const deleteButtonHtml = user.id === currentUserId
                    ? '<button class="delete-user-btn" disabled>Delete (Self)</button>'
                    : `<button class="delete-user-btn" data-user-id="${user.id}">Delete</button>`;
    
                userEl.innerHTML = `
                    <div class="user-info">
                        <span class="user-username">${user.username}</span>
                        <span class="user-role">${user.role}</span>
                        <span class="user-created">Created: ${createdAt}</span>
                    </div>
                    <div class="user-actions">
                        ${deleteButtonHtml}
                    </div>
                `;
                userList.appendChild(userEl);
            });
    
        } catch (error) {
            userList.innerHTML = `<p class="error-message">Error loading users: ${error.message}</p>`;
        }
    }

    async function handleDeleteUser(userId) {
        if (!confirm(`Are you sure you want to delete this user? This action cannot be undone.`)) return;
    
        try {
            const response = await authenticatedFetch(`${AppConfig.backendUrl}/api/users/${userId}`, { method: 'DELETE' });
            
            if (!response.ok) {
                if (response.headers.get('content-type')?.includes('application/json')) {
                    const errorResult = await response.json();
                    throw new Error(errorResult.error || 'Failed to delete user.');
                }
                throw new Error(`Server returned an unexpected response. Status: ${response.status}.`);
            }

            const result = await response.json();
            showToast(result.message, 'success');
            loadUsers(); // Refresh the user list
        } catch (error) {
            showToast(`Error: ${error.message}`, 'error');
        }
    }

    /**
     * Switches between the 'Content' and 'Users' pages in the admin panel.
     * @param {'content' | 'users'} pageName The name of the page to display.
     */
    function showPage(pageName) {
        // Hide all pages and deactivate all nav buttons
        contentManagementSection.classList.remove('active');
        userManagementContainer.classList.remove('active');
        navContentBtn.classList.remove('active');
        navUsersBtn.classList.remove('active');

        // Show the selected page and activate its nav button
        if (pageName === 'content') {
            contentManagementSection.classList.add('active');
            navContentBtn.classList.add('active');
        } else if (pageName === 'users' && userRole === 'admin') {
            userManagementContainer.classList.add('active');
            navUsersBtn.classList.add('active');
        }
    }

    function logout() {
        authToken = null;
        userRole = '';
        localStorage.removeItem('authToken');
        window.location.reload();
    }

    logoutButton.addEventListener('click', logout);

    function decodeJwt(token) {
        try {
            return JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
        } catch (e) {
            return null;
        }
    }
});
