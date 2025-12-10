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

    buttons.forEach(btn => {
        btn.addEventListener('click', function(e) {
            const ripple = document.createElement('span');
            const rect = btn.getBoundingClientRect();
            ripple.style.left = (e.clientX - rect.left) + 'px';
            ripple.style.top = (e.clientY - rect.top) + 'px';
            ripple.className = 'ripple';
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
    let nameSortDirection = 'asc'; // 'asc' for A-Z, 'desc' for Z-A
    
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
                        <a href="${data.affiliate_url}" target="_blank" rel="noopener noreferrer" class="item-name-link">
                            <h3 class="item-name">${data.name}</h3>
                        </a>
                        ${data.description ? `<p class="item-desc">${data.description}</p>` : ''}
                        <div class="item-footer">
                            <span class="item-date">${releaseDate}</span>
                            <a href="${data.affiliate_url}" class="btn-view" target="_blank" rel="noopener noreferrer">View Content</a>
                        </div>
                    </div>
                `;
                
                galleryContainer.appendChild(itemArticle);
            });

            // After rendering, check for long descriptions and make them expandable
            galleryContainer.querySelectorAll('.gallery-item').forEach(card => {
                const desc = card.querySelector('.item-desc');

                // Check if the content height is greater than the visible height. Using offsetHeight is more robust.
                if (desc && desc.scrollHeight > desc.offsetHeight) {
                    desc.classList.add('is-expandable');

                    const toggleExpand = (e) => {
                        e.preventDefault(); // Prevent link navigation if desc is inside a link
                        e.stopPropagation();
                        desc.classList.toggle('expanded');
                    };

                    desc.addEventListener('click', toggleExpand);
                }
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
                    item.name.toLowerCase().includes(searchTerm)
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
                if (nameSortDirection === 'asc') {
                    processedData.sort((a, b) => a.name.localeCompare(b.name)); // A-Z
                } else { // 'desc'
                    processedData.sort((a, b) => b.name.localeCompare(a.name)); // Z-A
                }
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
        sortDateBtn.innerHTML = `Date <span class="sort-arrow">&darr;</span>`; // Active by default
        sortNameBtn.innerHTML = `Name`; // Inactive, no arrow

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
            sortNameBtn.innerHTML = 'Name'; // Remove arrow from other button

            sortDateBtn.classList.add('active');
            sortNameBtn.classList.remove('active');
            updateDisplay();
        });

        sortNameBtn.addEventListener('click', () => {
            if (currentSort === 'name') {
                // If already sorting by name, just toggle the direction
                nameSortDirection = nameSortDirection === 'asc' ? 'desc' : 'asc';
            } else {
                // If switching from another sort, set to default name sort
                currentSort = 'name';
                nameSortDirection = 'asc';
            }

            // Update button text to show sort direction
            sortNameBtn.innerHTML = `Name <span class="sort-arrow">${nameSortDirection === 'asc' ? '&uarr;' : '&darr;'}</span>`; // ↑ or ↓
            sortDateBtn.innerHTML = 'Date'; // Remove arrow from other button

            sortNameBtn.classList.add('active');
            sortDateBtn.classList.remove('active');
            updateDisplay();
        });
    }
});