const AppConfig = {
    // IMPORTANT: Replace this URL with your actual Render backend URL.
    backendUrl: 'https://api.omefans.com'
};

document.addEventListener("DOMContentLoaded", function() {

    /* --- 1. STAR BACKGROUND --- */
    const starsContainer = document.getElementById('stars');
    if (starsContainer) {
        for (let i = 0; i < 100; i++) {
            const star = document.createElement('div');
            star.className = 'star';
            star.style.left = Math.random() * 100 + '%';
            star.style.top = Math.random() * 100 + '%';
            star.style.animationDelay = Math.random() * 3 + 's';
            star.style.animationDuration = (Math.random() * 3 + 2) + 's';
            starsContainer.appendChild(star);
        }
    }

    /* --- 2. MOUSE FOLLOWER --- */
    const follower = document.getElementById('mouseFollower');

    function applyMouseFollowerEffects() {
        // This function can be called multiple times to apply effects to new elements
        if (!follower || !window.matchMedia("(pointer: fine)").matches) return;
        
        const interactables = document.querySelectorAll('a, button, input, textarea, .gallery-item');
        interactables.forEach(el => {
            // Prevent adding the same listener multiple times
            if (el.dataset.followerAttached) return;

            el.addEventListener('mouseenter', () => {
                follower.style.transform = 'translate(-50%, -50%) scale(1.8)';
                follower.style.borderColor = '#ffffff';
                follower.style.background = 'rgba(255, 255, 255, 0.1)';
            });
            el.addEventListener('mouseleave', () => {
                follower.style.transform = 'translate(-50%, -50%) scale(1)';
                follower.style.borderColor = '#00d9ff';
                follower.style.background = 'rgba(255, 136, 0, 0.1)';
            });
            el.dataset.followerAttached = 'true';
        });
    }

    if (window.matchMedia("(pointer: fine)").matches && follower) {
        document.addEventListener('mousemove', (e) => {
            follower.style.left = e.clientX + 'px';
            follower.style.top = e.clientY + 'px';
        });
        applyMouseFollowerEffects(); // Initial call for static elements
    } else if (follower) {
        follower.style.display = 'none';
    }

    /* --- 3. BUTTON RIPPLE --- */
    const buttons = document.querySelectorAll('.cta-button');
    // This keyframe animation is better placed in your main CSS file.
    const style = document.createElement('style');
    style.textContent = `@keyframes ripple { to { width: 300px; height: 300px; opacity: 0; } }`;
    document.head.appendChild(style);

    buttons.forEach(btn => {
        // Set required styles once for efficiency. For best practice, move these to your CSS file.
        btn.style.position = 'relative';
        btn.style.overflow = 'hidden';

        btn.addEventListener('click', function(e) {
            const ripple = document.createElement('span');
            const rect = btn.getBoundingClientRect();
            ripple.style.left = (e.clientX - rect.left) + 'px';
            ripple.style.top = (e.clientY - rect.top) + 'px';
            // It's better to use a class for styling the ripple itself.
            ripple.className = 'ripple';
            ripple.style.animation = 'ripple 0.6s ease-out';
            btn.appendChild(ripple);
            setTimeout(() => ripple.remove(), 600);
        });
    });

    /* --- 4. PAGINATION --- */
    const galleryContainer = document.getElementById('gallery-container');
    const paginationControls = document.getElementById('pagination-controls');
    const searchBar = document.getElementById('search-bar');
    const sortDateBtn = document.getElementById('sort-date-btn');
    const sortNameBtn = document.getElementById('sort-name-btn');

    let masterGalleryData = []; // Holds the original full list of items from the server
    let currentSort = 'date'; // 'date' or 'name'
    let dateSortDirection = 'desc'; // 'desc' for recent, 'asc' for older
    
    function debounce(func, delay) {
        let timeout;
        return function(...args) {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), delay);
        };
    }

    if (galleryContainer && paginationControls) {
        const limit = 9;
        let allItems = []; // To hold all items fetched from the server

        function showPage(pageNumber) {
            // Hide all items first
            allItems.forEach(item => item.style.display = 'none');

            // Calculate start and end index
            const start = (pageNumber - 1) * limit;
            const end = pageNumber * limit;
            const pageItems = allItems.slice(start, end);

            // Show items for the current page
            pageItems.forEach(item => {
                item.style.display = 'block';
                item.style.animation = 'fadeIn 0.5s ease forwards';
            });

            // Update active button state
            const btns = paginationControls.querySelectorAll('.pagination-btn');
            btns.forEach(btn => {
                btn.classList.remove('active');
                if (parseInt(btn.innerText) === pageNumber) {
                    btn.classList.add('active');
                }
            });
        }

        function createPaginationButtons(totalPages) {
            paginationControls.innerHTML = '';
            if (totalPages > 1) {
                for (let i = 1; i <= totalPages; i++) {
                    const btn = document.createElement('button');
                    btn.innerText = i;
                    btn.className = 'pagination-btn';
                    if (i === 1) btn.classList.add('active');
                    btn.addEventListener('click', () => { showPage(i); });
                    paginationControls.appendChild(btn);
                }
            } else {
                paginationControls.style.display = 'none';
            }
        }

        function renderItems(itemsToRender) {
            galleryContainer.innerHTML = ''; // Clear previous content

            if (itemsToRender.length === 0) {
                galleryContainer.innerHTML = '<p class="gallery-message">No items match your search.</p>';
                paginationControls.style.display = 'none';
                return;
            }

            itemsToRender.forEach(data => {
                const itemArticle = document.createElement('article');
                itemArticle.className = 'gallery-item';

                // Format the date for display
                const releaseDate = new Date(data.created_at).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric'
                });

                itemArticle.innerHTML = `
                    <a href="${data.affiliate_url}" target="_blank" rel="noopener noreferrer" class="gallery-item-image-link">
                        <img src="${data.image_path}" alt="${data.name || 'Gallery Content'}" loading="lazy" class="gallery-item-img">
                    </a>
                    <div class="gallery-item-details">
                        <div class="item-text-content">
                            <h3 class="item-name">${data.name}</h3>
                            ${data.description ? `<p class="item-desc">${data.description}</p>` : ''}
                        </div>
                        <div class="item-footer">
                            <span class="item-date">${releaseDate}</span>
                            <a href="${data.affiliate_url}" class="btn-view" target="_blank" rel="noopener noreferrer">View Content</a>
                        </div>
                    </div>
                `;
                
                // Make the entire card clickable, except for the button itself.
                itemArticle.addEventListener('click', (e) => {
                    if (!e.target.closest('.btn-view')) {
                        window.open(data.affiliate_url, '_blank');
                    }
                });

                galleryContainer.appendChild(itemArticle);
            });

            // Re-apply mouse follower effects to the new dynamic items
            applyMouseFollowerEffects();

            // Setup pagination for the newly created items
            allItems = Array.from(galleryContainer.querySelectorAll('.gallery-item'));
            const totalPages = Math.ceil(allItems.length / limit);
            createPaginationButtons(totalPages);
            if (totalPages > 0) showPage(1);
        }

        function updateDisplay() {
            let processedData = [...masterGalleryData];
            const searchTerm = searchBar.value.toLowerCase();

            // 1. Filter by search term
            if (searchTerm) {
                processedData = processedData.filter(item => 
                    item.name.toLowerCase().includes(searchTerm) ||
                    (item.description && item.description.toLowerCase().includes(searchTerm))
                );
            }

            // 2. Sort the data
            if (currentSort === 'date') {
                if (dateSortDirection === 'desc') {
                    processedData.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)); // Newest first
                } else { // 'asc'
                    processedData.sort((a, b) => new Date(a.created_at) - new Date(b.created_at)); // Oldest first
                }
            } else if (currentSort === 'name') {
                processedData.sort((a, b) => a.name.localeCompare(b.name));
            }

            // 3. Render the processed data
            renderItems(processedData);
        }

        async function fetchAndDisplayGallery() {
            // Show a loading message while fetching data.
            galleryContainer.innerHTML = '<p class="gallery-message">Loading gallery...</p>';

            try {
                const response = await fetch(`${AppConfig.backendUrl}/api/gallery`);
                if (!response.ok) throw new Error('Network response was not ok');
                masterGalleryData = await response.json();
                updateDisplay(); // Initial render

            } catch (error) {
                console.error("Error fetching gallery:", error);
                galleryContainer.innerHTML = '<p class="gallery-message">Failed to load gallery content.</p>';
            }
        }

        // Set initial button state to show the default sort direction
        sortDateBtn.innerHTML = `Date <span class="sort-arrow">&darr;</span>`;

        fetchAndDisplayGallery();

        // Add event listeners for controls
        searchBar.addEventListener('input', debounce(() => {
            updateDisplay();
        }, 300)); // 300ms delay before triggering search

        sortDateBtn.addEventListener('click', () => {
            if (currentSort === 'date') {
                // If already sorting by date, just toggle the direction
                dateSortDirection = dateSortDirection === 'desc' ? 'asc' : 'desc';
            } else {
                // If switching from another sort, set to default date sort
                currentSort = 'date';
                dateSortDirection = 'desc';
            }

            // Update button text to show sort direction
            sortDateBtn.innerHTML = `Date <span class="sort-arrow">${dateSortDirection === 'desc' ? '&darr;' : '&uarr;'}</span>`; // ↓ or ↑

            sortDateBtn.classList.add('active');
            sortNameBtn.classList.remove('active');
            updateDisplay();
        });

        sortNameBtn.addEventListener('click', () => {
            currentSort = 'name';
            sortDateBtn.innerHTML = 'Date'; // Reset date button text, removing arrow
            sortNameBtn.classList.add('active');
            sortDateBtn.classList.remove('active');
            updateDisplay();
        });
    }
});

// It's best practice to define styles in a CSS file, but for dynamic elements,
// we can inject the necessary styles into the document head.
const utilityStyles = document.createElement('style');
utilityStyles.textContent = `
    .gallery-controls {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 40px;
        flex-wrap: wrap;
        gap: 20px;
    }
    .search-wrapper {
        position: relative;
        flex-grow: 1;
        max-width: 450px;
    }
    #search-bar {
        width: 100%;
        padding: 12px 20px 12px 45px;
        border-radius: 50px;
        border: 1px solid #444;
        background-color: #1a1a1a;
        color: white;
        font-size: 1rem;
        font-family: 'Space Grotesk', sans-serif;
        transition: border-color 0.3s, box-shadow 0.3s;
        outline: none;
    }
    #search-bar:focus {
        border-color: #00d9ff;
        box-shadow: 0 0 15px rgba(0, 217, 255, 0.2);
    }
    .search-wrapper::before {
        content: '';
        position: absolute;
        left: 15px;
        top: 50%;
        transform: translateY(-50%);
        width: 20px;
        height: 20px;
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='11' cy='11' r='8'%3E%3C/circle%3E%3Cline x1='21' y1='21' x2='16.65' y2='16.65'%3E%3C/line%3E%3C/svg%3E");
        background-size: contain;
        background-repeat: no-repeat;
        opacity: 0.6;
        transition: opacity 0.3s;
        pointer-events: none; /* Allows clicking through the icon */
    }
    .sort-buttons {
        display: flex;
        align-items: center;
        gap: 10px;
        background-color: #1a1a1a;
        padding: 5px;
        border-radius: 50px;
        border: 1px solid #444;
    }
    .sort-buttons span {
        padding-left: 15px;
        font-size: 0.9rem;
        color: #aaa;
    }
    .sort-btn {
        background: transparent;
        border: none;
        color: #ccc;
        padding: 8px 15px;
        border-radius: 50px;
        cursor: pointer;
        font-weight: 600;
        transition: background-color 0.3s, color 0.3s;
    }
    .sort-arrow {
        display: inline-block;
        margin-left: 6px;
        font-size: 1.1em;
        line-height: 1;
    }
    .sort-btn.active {
        background-color: #00d9ff;
        color: #111;
    }
    .sort-btn:not(.active):hover {
        background-color: #333;
    }
    .gallery-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 25px;
    }
    .gallery-item {
        position: relative;
        border-radius: 8px;
        overflow: hidden;
        background-color: #1a1a1a;
        cursor: pointer;
        transition: transform 0.3s ease, box-shadow 0.3s ease;
        display: flex; /* Use flexbox for column layout */
        flex-direction: column;
    }
    .gallery-item:hover {
        transform: translateY(-5px);
        box-shadow: 0 10px 20px rgba(0, 217, 255, 0.1);
    }
    .gallery-item-image-link {
        display: block;
        width: 100%;
        aspect-ratio: 1 / 1; /* Make image area square */
        overflow: hidden;
    }
    .gallery-item-img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        transition: transform 0.4s ease;
    }
    .gallery-item:hover .gallery-item-img {
        transform: scale(1.1);
    }
    .gallery-item-details {
        flex-grow: 1; /* Allow details section to take remaining space */
        padding: 15px;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        box-sizing: border-box;
        color: #fff;
    }
    .item-text-content {
        margin-bottom: 10px; /* Space between text and footer */
    }
    .item-name {
        font-family: 'Orbitron', sans-serif;
        font-size: 1.1rem;
        margin: 0 0 5px 0;
        color: #fff;
    }
    .item-desc {
        font-size: 0.85rem;
        color: #ccc;
        margin: 0;
        line-height: 1.4;
    }
    .item-footer {
        display: flex;
        justify-content: space-between;
        align-items: center;
    }
    .item-date {
        font-size: 0.8rem;
        color: #ddd;
        font-weight: 600;
    }
    .btn-view {
        background: #00d9ff;
        color: #111;
        padding: 8px 16px;
        border-radius: 5px;
        text-decoration: none;
        font-weight: bold;
        font-size: 0.9rem;
        transition: background-color 0.3s;
        border: none; /* Ensure it looks like a button */
    }
    .btn-view:hover {
        background: #fff;
    }
    .gallery-message { color: white; text-align: center; width: 100%; }
    .ripple {
        position: absolute;
        width: 20px; height: 20px;
        background: rgba(255, 255, 255, 0.4);
        border-radius: 50%;
        transform: translate(-50%, -50%);
    }
    .pagination-btn {
        background-color: #2a2a2a;
        color: #ccc;
        border: 1px solid #444;
        padding: 10px 15px;
        margin: 0 5px;
        border-radius: 5px;
        cursor: pointer;
        transition: background-color 0.3s, color 0.3s;
        font-weight: bold;
    }
    .pagination-btn:hover, .pagination-btn.active {
        background-color: #00d9ff;
        color: #111;
        border-color: #00d9ff;
    }
    @keyframes fadeIn {
        from { opacity: 0; transform: translateY(10px); }
        to { opacity: 1; transform: translateY(0); }
    }
    @media (max-width: 768px) {
        .gallery-grid {
            grid-template-columns: repeat(2, 1fr);
        }
    }
    @media (max-width: 480px) {
        .gallery-grid {
            grid-template-columns: 1fr;
        }
    }
`;
document.head.appendChild(utilityStyles);