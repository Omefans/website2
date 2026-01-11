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
    const formSubmitButton = uploadForm ? uploadForm.querySelector('button[type="submit"]') : null;
    const cancelEditButton = document.getElementById('cancel-edit-btn');
    const logoutButton = document.getElementById('logout-btn');

    // New UI elements for tabbed navigation
    const adminPanelMain = document.getElementById('admin-panel-main');
    const contentManagementSection = document.getElementById('content-management-section');
    const userManagementContainer = document.getElementById('user-management-container');
    const navContentBtn = document.getElementById('nav-content-btn');
    const navUsersBtn = document.getElementById('nav-users-btn');
    const navAutomationBtn = document.getElementById('nav-automation-btn');
    const automationSection = document.getElementById('automation-management-section');
    const navSecurityBtn = document.getElementById('nav-security-btn');
    const securitySection = document.getElementById('security-section');
    const banIpForm = document.getElementById('ban-ip-form');
    const navAnnouncementsBtn = document.getElementById('nav-announcements-btn');
    const announcementsSection = document.getElementById('announcements-section');
    const announcementsList = document.getElementById('announcements-list');
    const bannedIpsList = document.getElementById('banned-ips-list');
    const systemLogsList = document.getElementById('system-logs-list');
    const updateTelegramTokenForm = document.getElementById('update-telegram-token-form');
    const updateDiscordAnnouncementForm = document.getElementById('update-discord-announcement-form');
    const testDiscordAnnouncementBtn = document.getElementById('test-discord-announcement-btn');
    const addTelegramForm = document.getElementById('add-telegram-form');
    const telegramList = document.getElementById('telegram-list');
    const addDiscordForm = document.getElementById('add-discord-form');
    const discordList = document.getElementById('discord-list');
    const navProfileBtn = document.getElementById('nav-profile-btn');
    const profileSection = document.getElementById('profile-section');
    const profileUsernameEl = document.getElementById('profile-username');
    const profileRoleEl = document.getElementById('profile-role');
    const addUserForm = document.getElementById('add-user-form');
    const userList = document.getElementById('user-list');
    const changePasswordBtn = document.getElementById('change-password-btn');
    const passwordModal = document.getElementById('password-modal');
    const closePasswordModalBtn = passwordModal.querySelector('.modal-close-btn');
    const changePasswordForm = document.getElementById('change-password-form');
    const announcementBtn = document.getElementById('announcement-btn');
    const announcementModal = document.getElementById('announcement-modal');
    const closeAnnouncementModalBtn = announcementModal ? announcementModal.querySelector('.modal-close-btn') : null;
    const postAnnouncementForm = document.getElementById('post-announcement-form');
    const previewAnnouncementBtn = document.getElementById('preview-announcement-btn');
    const postWebsiteOnlyBtn = document.getElementById('post-website-only-btn');

    const loginButton = loginForm ? loginForm.querySelector('button[type="submit"]') : null;

    let galleryItemsCache = [];
    let currentSearchTerm = '';
    let currentSort = {
        field: 'createdAt', // 'createdAt' or 'name'
        order: 'desc'       // 'asc' or 'desc'
    };

    let authToken = localStorage.getItem('authToken');
    let userRole = '';
    let currentUserId = null;
    let currentUsername = '';

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
    navAutomationBtn.addEventListener('click', () => showPage('automation'));
    navSecurityBtn.addEventListener('click', () => showPage('security'));
    navAnnouncementsBtn.addEventListener('click', () => showPage('announcements'));
    navProfileBtn.addEventListener('click', () => showPage('profile'));

    // Check if a token exists on page load
    if (authToken) {
        try {
            const payload = decodeJwt(authToken);
            if (!payload || payload.exp * 1000 < Date.now()) {
                throw new Error("Token is expired or invalid.");
            }
            userRole = payload.role;
            currentUserId = payload.sub;
            currentUsername = payload.username;
            showLoggedInState();
        } catch (e) {
            console.error("Invalid or expired token found:", e.message);
            logout(); // This will clear the bad token
        }
    }

    if (loginForm) loginForm.addEventListener('submit', async (e) => {
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
            currentUsername = payload.username;

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

    if (updateTelegramTokenForm) {
        updateTelegramTokenForm.addEventListener('submit', handleUpdateTelegramToken);
    }

    if (updateDiscordAnnouncementForm) {
        updateDiscordAnnouncementForm.addEventListener('submit', handleUpdateDiscordAnnouncement);
    }
    if (testDiscordAnnouncementBtn) {
        testDiscordAnnouncementBtn.addEventListener('click', handleTestDiscordAnnouncement);
    }

    if (banIpForm) {
        banIpForm.addEventListener('submit', handleBanIp);
    }
    if (bannedIpsList) {
        bannedIpsList.addEventListener('click', (e) => {
            if (e.target.classList.contains('unban-btn')) {
                handleUnbanIp(e.target.dataset.ip);
            }
        });
    }

    if (announcementsList) {
        announcementsList.addEventListener('click', (e) => {
            if (e.target.classList.contains('delete-announcement-btn')) {
                handleDeleteAnnouncement(e.target.dataset.id);
            }
        });
    }

    // Event listeners for Telegram management
    if (addTelegramForm) {
        addTelegramForm.addEventListener('submit', handleAddTelegram);
    }
    if (telegramList) {
        telegramList.addEventListener('click', (e) => {
            if (e.target.classList.contains('delete-tg-btn')) {
                const id = e.target.dataset.id;
                if (id) handleDeleteTelegram(id);
            }
        });
    }

    // Event listeners for Discord management
    if (addDiscordForm) {
        addDiscordForm.addEventListener('submit', handleAddDiscord);
    }
    if (discordList) {
        discordList.addEventListener('click', (e) => {
            if (e.target.classList.contains('delete-discord-btn')) {
                const id = e.target.dataset.id;
                if (id) handleDeleteDiscord(id);
            }
        });
    }

    // Event listeners for password change modal
    if (changePasswordBtn && passwordModal && closePasswordModalBtn && changePasswordForm) {
        changePasswordBtn.addEventListener('click', () => {
            passwordModal.classList.add('show');
        });

        const closeModal = () => {
            passwordModal.classList.remove('show');
            changePasswordForm.reset();
        };

        closePasswordModalBtn.addEventListener('click', closeModal);
        passwordModal.addEventListener('click', (e) => {
            if (e.target === passwordModal) closeModal();
        });

        changePasswordForm.addEventListener('submit', handleChangePassword);
    }

    // Event listeners for announcement modal
    if (announcementBtn && announcementModal && closeAnnouncementModalBtn && postAnnouncementForm) {
        announcementBtn.addEventListener('click', () => {
            announcementModal.classList.add('show');
        });

        const closeAnnModal = () => {
            announcementModal.classList.remove('show');
            postAnnouncementForm.reset();
        };

        closeAnnouncementModalBtn.addEventListener('click', closeAnnModal);
        announcementModal.addEventListener('click', (e) => {
            if (e.target === announcementModal) closeAnnModal();
        });

        postAnnouncementForm.addEventListener('submit', handlePostAnnouncement);
        if (previewAnnouncementBtn) previewAnnouncementBtn.addEventListener('click', handlePreviewAnnouncement);
        if (postWebsiteOnlyBtn) postWebsiteOnlyBtn.addEventListener('click', (e) => {
            handlePostAnnouncement(e, true);
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
            loadTelegramAdmins(); // Load telegram data
            loadTelegramToken(); // Load telegram token
            loadDiscordAnnouncement(); // Load discord announcement webhook
            loadBannedIps(); // Load bans
            loadSystemLogs(); // Load logs
            loadDiscordWebhooks(); // Load discord data
            loadAnnouncements(); // Load announcements
            // Allow admins to create other admins
            const roleSelect = document.getElementById('new-role');
            if (roleSelect && !roleSelect.querySelector('option[value="admin"]')) {
                const adminOption = document.createElement('option');
                adminOption.value = 'admin';
                adminOption.textContent = 'Admin';
                roleSelect.appendChild(adminOption);
            }
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
                        <button id="admin-sort-likes-btn" class="sort-btn"></button>
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
        let searchTimeout;
        document.getElementById('admin-search-bar').addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                currentSearchTerm = e.target.value.toLowerCase();
                renderItems();
            }, 300);
        });

        document.getElementById('admin-sort-date-btn').addEventListener('click', () => setSort('createdAt'));
        document.getElementById('admin-sort-name-btn').addEventListener('click', () => setSort('name'));
        document.getElementById('admin-sort-likes-btn').addEventListener('click', () => setSort('likes'));
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
        const likesBtn = document.getElementById('admin-sort-likes-btn');

        // Reset both buttons
        dateBtn.innerHTML = 'Date';
        nameBtn.innerHTML = 'Name';
        likesBtn.innerHTML = 'Likes';
        dateBtn.classList.remove('active');
        nameBtn.classList.remove('active');
        likesBtn.classList.remove('active');

        if (currentSort.field === 'createdAt') {
            dateBtn.classList.add('active');
            dateBtn.innerHTML = `Date ${currentSort.order === 'desc' ? '&#9660;' : '&#9650;'}`; // ▼ or ▲
        } else if (currentSort.field === 'name') { // name
            nameBtn.classList.add('active');
            nameBtn.innerHTML = `Name ${currentSort.order === 'asc' ? 'A-Z' : 'Z-A'}`;
        } else if (currentSort.field === 'likes') {
            likesBtn.classList.add('active');
            likesBtn.innerHTML = `Likes ${currentSort.order === 'desc' ? '&#9660;' : '&#9650;'}`;
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

        const fragment = document.createDocumentFragment();
        itemsToDisplay.forEach(item => {
            const createdAt = new Date(item.createdAt);
            const formattedDate = createdAt.toLocaleDateString('en-US', {
                year: 'numeric', month: 'short', day: 'numeric'
            });

            const itemEl = document.createElement('div');
            itemEl.className = 'admin-item-card';
            itemEl.dataset.id = item.id;
            
            // Visual polish: Different color for OnlyFans category
            const categoryColor = (item.category && item.category.toLowerCase() === 'onlyfans') ? '#FF8800' : '#58a6ff';

            itemEl.innerHTML = `
                <img src="${item.imageUrl}" alt="Preview" class="item-card-image" onerror="this.style.display='none'">
                <div class="item-card-content">
                    <div class="item-card-header">
                        <div class="item-name-wrapper">
                            <span class="item-name">${item.name || 'Untitled Item'}</span>
                            ${item.isFeatured ? '<span class="featured-badge">Featured</span>' : ''}
                        </div>
                        <div class="item-meta">
                            <span class="item-category" style="color: ${categoryColor}; text-transform: capitalize; font-weight: 600;">${item.category || 'Omegle'}</span>
                            <span class="item-date">${formattedDate}</span>
                            <span class="item-likes" style="display: flex; align-items: center; gap: 6px;">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="#f91880" stroke="#f91880" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg> ${item.likes || 0}
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="#da3633" stroke="#da3633" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17"></path></svg> ${item.dislikes || 0}
                            </span>
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
            fragment.appendChild(itemEl);
        });
        itemListContainer.appendChild(fragment);
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
        
        // Fix: Explicitly handle category selection
        const categorySelect = document.getElementById('category');
        if (categorySelect) {
            // Default to 'omegle' if category is missing or invalid
            let targetValue = 'omegle';
            if (itemToEdit.category) {
                targetValue = itemToEdit.category.toString().toLowerCase().trim();
            }
            
            // Try to set the value, if it fails (invalid option), default to index 0
            categorySelect.value = targetValue;
            if (categorySelect.value !== targetValue) categorySelect.selectedIndex = 0;
        }
        
        document.getElementById('description').value = itemToEdit.description || '';
        document.getElementById('imageUrl').value = itemToEdit.imageUrl || '';
        document.getElementById('affiliateUrl').value = itemToEdit.affiliateUrl || '';
        document.getElementById('isFeatured').checked = !!itemToEdit.isFeatured;

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
        document.getElementById('isFeatured').checked = false;
        cancelEditButton.style.display = 'none';
    }

    if (cancelEditButton) cancelEditButton.addEventListener('click', cancelEdit);

    if (uploadForm) uploadForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const editingId = editIdInput.value;
        const isEditing = !!editingId;

        const loadingText = isEditing ? 'Updating...' : 'Adding...';
        setButtonLoadingState(formSubmitButton, true, loadingText);
        
        const categoryEl = document.getElementById('category');
        const data = {
            name: document.getElementById('name').value,
            category: (categoryEl && categoryEl.value) ? categoryEl.value : 'omegle',
            description: document.getElementById('description').value,
            imageUrl: document.getElementById('imageUrl').value,
            affiliateUrl: document.getElementById('affiliateUrl').value,
            isFeatured: document.getElementById('isFeatured').checked
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
    
            const fragment = document.createDocumentFragment();
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
                fragment.appendChild(userEl);
            });
            userList.appendChild(fragment);
    
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

    async function handleBanIp(e) {
        e.preventDefault();
        const form = e.target;
        const ip = document.getElementById('ban-ip-input').value;
        try {
            const response = await authenticatedFetch(`${AppConfig.backendUrl}/api/security/bans`, {
                method: 'POST',
                body: JSON.stringify({ ip, reason: 'Admin Panel Ban' })
            });
            if (response.ok) {
                showToast('IP Banned', 'success');
                form.reset();
                loadBannedIps();
                loadSystemLogs();
            } else { showToast('Failed to ban IP', 'error'); }
        } catch (e) { showToast(e.message, 'error'); }
    }

    async function handleUnbanIp(ip) {
        if (!confirm(`Unban ${ip}?`)) return;
        try {
            await authenticatedFetch(`${AppConfig.backendUrl}/api/security/bans/${ip}`, { method: 'DELETE' });
            showToast('IP Unbanned', 'success');
            loadBannedIps();
            loadSystemLogs();
        } catch (e) { showToast(e.message, 'error'); }
    }

    async function loadBannedIps() {
        if (!bannedIpsList) return;
        try {
            const response = await authenticatedFetch(`${AppConfig.backendUrl}/api/security/bans`);
            const items = await response.json();
            bannedIpsList.innerHTML = '';
            if (items.length === 0) { bannedIpsList.innerHTML = '<p>No bans.</p>'; return; }
            items.forEach(item => {
                const el = document.createElement('div');
                el.className = 'user-list-item';
                el.innerHTML = `
                    <div class="user-info"><span class="user-username">${item.ip}</span><span class="user-role">${item.reason}</span></div>
                    <div class="user-actions"><button class="unban-btn" data-ip="${item.ip}">Unban</button></div>
                `;
                bannedIpsList.appendChild(el);
            });
        } catch (e) {}
    }

    async function loadSystemLogs() {
        if (!systemLogsList) return;
        try {
            const response = await authenticatedFetch(`${AppConfig.backendUrl}/api/logs`);
            const logs = await response.json();
            systemLogsList.innerHTML = '';
            if (logs.length === 0) { systemLogsList.innerHTML = '<p>No logs.</p>'; return; }
            logs.forEach(log => {
                systemLogsList.innerHTML += `<div style="margin-bottom: 8px; border-bottom: 1px solid #30363d; padding-bottom: 4px;"><span style="color: ${log.level === 'WARN' ? '#e3b341' : (log.level === 'ERROR' ? '#f85149' : '#3fb950')}">[${log.level}]</span> <span style="color: #8b949e;">${new Date(log.created_at).toLocaleString()}</span><br>${log.message}</div>`;
            });
        } catch (e) {}
    }

    async function handleUpdateTelegramToken(e) {
        e.preventDefault();
        const form = e.target;
        const button = form.querySelector('button[type="submit"]');
        const token = document.getElementById('tg-bot-token').value;

        setButtonLoadingState(button, true, 'Updating...');
        try {
            const response = await authenticatedFetch(`${AppConfig.backendUrl}/api/config/telegram`, {
                method: 'POST',
                body: JSON.stringify({ token })
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || 'Failed to update token.');

            showToast(result.message, 'success');
            // Don't reset form so user can see what they typed if they want, or clear it? 
            // Usually better to clear password fields or leave them if they are masked.
            // Let's reload the value to confirm it saved.
            loadTelegramToken();
        } catch (error) {
            showToast(`Error: ${error.message}`, 'error');
        } finally {
            setButtonLoadingState(button, false);
        }
    }

    async function loadTelegramToken() {
        const input = document.getElementById('tg-bot-token');
        if (!input) return;
        try {
            const response = await authenticatedFetch(`${AppConfig.backendUrl}/api/config/telegram`);
            if (response.ok) {
                const data = await response.json();
                input.value = data.token || '';
            }
        } catch (e) { console.error(e); }
    }

    async function handleUpdateDiscordAnnouncement(e) {
        e.preventDefault();
        const form = e.target;
        const button = form.querySelector('button[type="submit"]');
        const url = document.getElementById('discord-announcement-url').value;

        setButtonLoadingState(button, true, 'Updating...');
        try {
            const response = await authenticatedFetch(`${AppConfig.backendUrl}/api/config/discord_announcement`, {
                method: 'POST',
                body: JSON.stringify({ url })
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || 'Failed to update webhook.');

            showToast(result.message, 'success');
            loadDiscordAnnouncement();
        } catch (error) {
            showToast(`Error: ${error.message}`, 'error');
        } finally {
            setButtonLoadingState(button, false);
        }
    }

    async function handleTestDiscordAnnouncement() {
        const button = document.getElementById('test-discord-announcement-btn');
        setButtonLoadingState(button, true, 'Testing...');
        try {
            const response = await authenticatedFetch(`${AppConfig.backendUrl}/api/config/discord_announcement/test`, { method: 'POST' });
            const result = await response.json();
            if (response.ok) {
                showToast(result.message, 'success');
            } else {
                showToast(result.error || 'Test failed', 'error');
            }
        } catch (e) { showToast(e.message, 'error'); }
        finally { setButtonLoadingState(button, false, 'Test'); }
    }

    async function loadDiscordAnnouncement() {
        const input = document.getElementById('discord-announcement-url');
        if (!input) return;
        try {
            const response = await authenticatedFetch(`${AppConfig.backendUrl}/api/config/discord_announcement`);
            if (response.ok) {
                const data = await response.json();
                input.value = data.url || '';
            }
        } catch (e) { console.error(e); }
    }

    async function handleAddTelegram(e) {
        e.preventDefault();
        const form = e.target;
        const button = form.querySelector('button[type="submit"]');
        const chatId = document.getElementById('tg-chat-id').value;
        const name = document.getElementById('tg-name').value;

        setButtonLoadingState(button, true, 'Adding...');
        try {
            const response = await authenticatedFetch(`${AppConfig.backendUrl}/api/users/telegram`, {
                method: 'POST',
                body: JSON.stringify({ chat_id: chatId, name })
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || 'Failed to add Chat ID.');

            showToast(result.message, 'success');
            form.reset();
            loadTelegramAdmins();
        } catch (error) {
            showToast(`Error: ${error.message}`, 'error');
        } finally {
            setButtonLoadingState(button, false);
        }
    }

    async function loadTelegramAdmins() {
        if (!telegramList) return;
        try {
            const response = await authenticatedFetch(`${AppConfig.backendUrl}/api/users/telegram`);
            if (!response.ok) return; // Fail silently or handle error
            const items = await response.json();
            telegramList.innerHTML = '';
            
            if (items.length === 0) {
                telegramList.innerHTML = '<p>No Chat IDs found.</p>';
                return;
            }

            const fragment = document.createDocumentFragment();
            items.forEach(item => {
                const el = document.createElement('div');
                el.className = 'user-list-item';
                el.innerHTML = `
                    <div class="user-info">
                        <span class="user-username">${item.chat_id}</span>
                        <span class="user-role">${item.name || 'No Name'}</span>
                    </div>
                    <div class="user-actions">
                        <button class="delete-tg-btn" data-id="${item.id}" style="background: #da3633;">Delete</button>
                    </div>
                `;
                fragment.appendChild(el);
            });
            telegramList.appendChild(fragment);
        } catch (e) { console.error(e); }
    }

    async function handleDeleteTelegram(id) {
        if (!confirm('Remove this Chat ID?')) return;
        try {
            const response = await authenticatedFetch(`${AppConfig.backendUrl}/api/users/telegram/${id}`, { method: 'DELETE' });
            if (response.ok) {
                showToast('Chat ID removed', 'success');
                loadTelegramAdmins();
            } else {
                showToast('Failed to remove ID', 'error');
            }
        } catch (e) { showToast(e.message, 'error'); }
    }

    async function handleAddDiscord(e) {
        e.preventDefault();
        const form = e.target;
        const button = form.querySelector('button[type="submit"]');
        const url = document.getElementById('discord-url').value;
        const name = document.getElementById('discord-name').value;

        setButtonLoadingState(button, true, 'Adding...');
        try {
            const response = await authenticatedFetch(`${AppConfig.backendUrl}/api/users/discord`, {
                method: 'POST',
                body: JSON.stringify({ url, name })
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || 'Failed to add Webhook.');

            showToast(result.message, 'success');
            form.reset();
            loadDiscordWebhooks();
        } catch (error) {
            showToast(`Error: ${error.message}`, 'error');
        } finally {
            setButtonLoadingState(button, false);
        }
    }

    async function loadDiscordWebhooks() {
        if (!discordList) return;
        try {
            const response = await authenticatedFetch(`${AppConfig.backendUrl}/api/users/discord`);
            if (!response.ok) return;
            const items = await response.json();
            discordList.innerHTML = '';
            
            if (items.length === 0) {
                discordList.innerHTML = '<p>No Webhooks found.</p>';
                return;
            }

            const fragment = document.createDocumentFragment();
            items.forEach(item => {
                const el = document.createElement('div');
                el.className = 'user-list-item';
                el.innerHTML = `
                    <div class="user-info">
                        <span class="user-username" style="font-size: 0.85rem; word-break: break-all;">${item.url}</span>
                        <span class="user-role">${item.name || 'No Name'}</span>
                    </div>
                    <div class="user-actions">
                        <button class="delete-discord-btn" data-id="${item.id}" style="background: #da3633;">Delete</button>
                    </div>
                `;
                fragment.appendChild(el);
            });
            discordList.appendChild(fragment);
        } catch (e) { console.error(e); }
    }

    async function handleDeleteDiscord(id) {
        if (!confirm('Remove this Webhook?')) return;
        try {
            const response = await authenticatedFetch(`${AppConfig.backendUrl}/api/users/discord/${id}`, { method: 'DELETE' });
            if (response.ok) {
                showToast('Webhook removed', 'success');
                loadDiscordWebhooks();
            } else {
                showToast('Failed to remove Webhook', 'error');
            }
        } catch (e) { showToast(e.message, 'error'); }
    }

    async function handleChangePassword(e) {
        e.preventDefault();
        const button = changePasswordForm.querySelector('button[type="submit"]');
        const oldPassword = document.getElementById('current-password').value;
        const newPassword = document.getElementById('new-password-modal').value;
        const confirmPassword = document.getElementById('confirm-password').value;

        if (newPassword !== confirmPassword) {
            showToast('New passwords do not match.', 'error');
            return;
        }

        if (newPassword.length < 6) {
            showToast('New password must be at least 6 characters long.', 'error');
            return;
        }

        setButtonLoadingState(button, true, 'Updating...');
        try {
            const response = await authenticatedFetch(`${AppConfig.backendUrl}/api/profile/password`, {
                method: 'PUT',
                body: JSON.stringify({ oldPassword, newPassword })
            });

            const result = await response.json();
            if (!response.ok) throw new Error(result.error || 'Failed to update password.');

            showToast(result.message, 'success');
            showToast('For security, you will be logged out.', 'success');
            setTimeout(logout, 2000); // Force logout after password change

        } catch (error) {
            showToast(`Error: ${error.message}`, 'error');
        } finally {
            setButtonLoadingState(button, false);
        }
    }

    async function handlePostAnnouncement(e, websiteOnly = false) {
        e.preventDefault();
        const button = websiteOnly ? document.getElementById('post-website-only-btn') : postAnnouncementForm.querySelector('button[type="submit"]');
        const title = document.getElementById('announcement-title').value;
        const message = document.getElementById('announcement-message').value;
        const imageUrl = document.getElementById('announcement-image').value;
        const linkUrl = document.getElementById('announcement-link').value;
        const duration = document.getElementById('announcement-duration').value;

        setButtonLoadingState(button, true, websiteOnly ? 'Posting...' : 'Broadcasting...');
        try {
            const response = await authenticatedFetch(`${AppConfig.backendUrl}/api/announcements`, {
                method: 'POST',
                body: JSON.stringify({ title, message, duration, imageUrl, linkUrl, websiteOnly })
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || 'Failed to post announcement.');

            showToast(result.message, 'success');
            announcementModal.classList.remove('show');
            postAnnouncementForm.reset();
            loadAnnouncements();
        } catch (error) {
            showToast(`Error: ${error.message}`, 'error');
        } finally {
            setButtonLoadingState(button, false);
        }
    }

    function handlePreviewAnnouncement() {
        const title = document.getElementById('announcement-title').value;
        const message = document.getElementById('announcement-message').value;
        const imageUrl = document.getElementById('announcement-image').value;
        const linkUrl = document.getElementById('announcement-link').value;

        if (!title || !message) {
            showToast('Please enter a title and message to preview.', 'error');
            return;
        }

        // Create a temporary notification to show the preview
        const previewNotification = document.createElement('div');
        Object.assign(previewNotification.style, {
            position: 'fixed', top: '20px', right: '20px', width: '300px', maxWidth: '90vw',
            backgroundColor: 'rgba(22, 27, 34, 0.95)', backdropFilter: 'blur(8px)',
            borderLeft: '4px solid #58a6ff', borderRadius: '4px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)', zIndex: '20000', padding: '16px',
            opacity: '0', transform: 'translateY(-20px)',
            transition: 'opacity 0.3s ease, transform 0.3s ease',
            fontFamily: "'Inter', sans-serif"
        });

        previewNotification.innerHTML = `
            <div style="display: flex; align-items: start; gap: 12px;">
                <div style="flex: 1;">
                    <h3 style="margin: 0 0 4px 0; font-size: 14px; font-weight: 600; color: #58a6ff;">${title}</h3>
                    <div style="font-size: 13px; line-height: 1.4; color: #c9d1d9;">${message}</div>
                </div>
                <button class="close-preview" style="background: none; border: none; color: #8b949e; cursor: pointer; padding: 0; margin-top: 2px;">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
            </div>
            ${imageUrl ? `<div style="margin-top: 10px;"><img src="${imageUrl}" style="width: 100%; border-radius: 4px; display: block;"></div>` : ''}
            ${linkUrl ? `<div style="margin-top: 10px;"><a href="${linkUrl}" target="_blank" style="display: block; width: 100%; padding: 8px 0; background: #238636; color: white; text-align: center; border-radius: 4px; text-decoration: none; font-size: 13px; font-weight: 600;">Visit Link</a></div>` : ''}
        `;

        document.body.appendChild(previewNotification);
        
        requestAnimationFrame(() => { 
            previewNotification.style.opacity = '1';
            previewNotification.style.transform = 'translateY(0)'; 
        });

        const close = () => {
            previewNotification.style.opacity = '0';
            previewNotification.style.transform = 'translateY(-20px)';
            setTimeout(() => previewNotification.remove(), 300);
        };
        previewNotification.querySelector('.close-preview').addEventListener('click', close);
    }

    async function loadAnnouncements() {
        if (!announcementsList) return;
        try {
            const response = await authenticatedFetch(`${AppConfig.backendUrl}/api/announcements`);
            const items = await response.json();
            announcementsList.innerHTML = '';
            if (items.length === 0) { announcementsList.innerHTML = '<p>No announcements found.</p>'; return; }
            
            items.forEach(item => {
                const el = document.createElement('div');
                el.className = 'user-list-item';
                el.innerHTML = `
                    <div class="user-info">
                        <span class="user-username">${item.title}</span>
                        <span class="user-role" style="font-size: 0.8rem;">${new Date(item.created_at).toLocaleDateString()}</span>
                    </div>
                    <div class="user-actions"><button class="delete-announcement-btn" data-id="${item.id}" style="background: #da3633;">Delete</button></div>
                `;
                announcementsList.appendChild(el);
            });
        } catch (e) {}
    }

    async function handleDeleteAnnouncement(id) {
        if (!confirm('Delete this announcement?')) return;
        try {
            await authenticatedFetch(`${AppConfig.backendUrl}/api/announcements/${id}`, { method: 'DELETE' });
            showToast('Announcement deleted', 'success');
            loadAnnouncements();
        } catch (e) { showToast(e.message, 'error'); }
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
        automationSection.classList.remove('active');
        navAutomationBtn.classList.remove('active');
        securitySection.classList.remove('active');
        navSecurityBtn.classList.remove('active');
        announcementsSection.classList.remove('active');
        navAnnouncementsBtn.classList.remove('active');
        profileSection.classList.remove('active');
        navProfileBtn.classList.remove('active');

        // Show the selected page and activate its nav button
        if (pageName === 'content') {
            contentManagementSection.classList.add('active');
            navContentBtn.classList.add('active');
        } else if (pageName === 'users' && userRole === 'admin') {
            userManagementContainer.classList.add('active');
            navUsersBtn.classList.add('active');
        } else if (pageName === 'automation' && userRole === 'admin') {
            automationSection.classList.add('active');
            navAutomationBtn.classList.add('active');
        } else if (pageName === 'security' && userRole === 'admin') {
            securitySection.classList.add('active');
            navSecurityBtn.classList.add('active');
        } else if (pageName === 'announcements' && userRole === 'admin') {
            announcementsSection.classList.add('active');
            navAnnouncementsBtn.classList.add('active');
        } else if (pageName === 'profile') {
            profileSection.classList.add('active');
            navProfileBtn.classList.add('active');
            if (profileUsernameEl) profileUsernameEl.textContent = currentUsername;
            if (profileRoleEl) profileRoleEl.textContent = userRole;
        }
    }

    function logout() {
        authToken = null;
        userRole = '';
        localStorage.removeItem('authToken');
        window.location.reload();
    }

    if (logoutButton) logoutButton.addEventListener('click', logout);

    function decodeJwt(token) {
        try {
            return JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
        } catch (e) {
            return null;
        }
    }
});
