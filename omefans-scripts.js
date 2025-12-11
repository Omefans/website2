const AppConfig = {
    // The live URL for the Cloudflare Worker backend.
    backendUrl: 'https://omefans-site.omefans.workers.dev'
};

document.addEventListener("DOMContentLoaded", function() {

    /* --- CHRISTMAS ATMOSPHERE: SNOWFLAKES --- */
    const SNOWFLAKE_COUNT = 50; // Number of snowflakes
    const body = document.querySelector('body');

    if (body) {
        for (let i = 0; i < SNOWFLAKE_COUNT; i++) {
            const snowflake = document.createElement('div');
            const fallDuration = Math.random() * 10 + 5; // 5-15 seconds
            const swayDuration = Math.random() * 4 + 2; // 2-6 seconds

            snowflake.innerHTML = '❄';
            snowflake.classList.add('snowflake');
            snowflake.style.left = `${Math.random() * 100}vw`;
            snowflake.style.fontSize = `${Math.random() * 1 + 0.5}rem`;
            snowflake.style.opacity = Math.random() * 0.7 + 0.3;
            snowflake.style.animationDuration = `${fallDuration}s, ${swayDuration}s`;
            snowflake.style.animationDelay = `${Math.random() * 15}s`;

            body.appendChild(snowflake);
        }
    }

    /* --- NEW: MODAL SETUP --- */
    const modal = document.getElementById('imageModal');
    const modalImg = document.getElementById('modalImage');
    const closeModal = document.querySelector('.close-modal');

    if (modal && closeModal && modalImg) {
        const close = () => {
            modal.style.display = "none";
            modalImg.src = ""; // Clear src to stop loading if in progress
        };
        closeModal.addEventListener('click', close);
        modal.addEventListener('click', (e) => {
            // Close if clicking on the background, but not on the image itself
            if (e.target === modal) {
                close();
            }
        });
        // Also close on escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === "Escape" && modal.style.display === "block") close();
        });
    }

    /* --- NEW: DISABLE RIGHT-CLICK AND CTRL+U --- */
    // Disable right-click
    document.addEventListener('contextmenu', (e) => {
        e.preventDefault();
    });

    // Disable Ctrl+U (View Source)
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.key === 'u') {
            e.preventDefault();
        }
    });

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
        
        const interactables = document.querySelectorAll('a, button, input, textarea, .gallery-item, .item-desc.is-expandable');
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
                const releaseDate = new Date(data.createdAt).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric'
                });

                itemArticle.innerHTML = `
                    <div class="gallery-item-image-link">
                        <img src="${data.imageUrl}" alt="${data.name || 'Gallery Content'}" loading="lazy" class="gallery-item-img">
                    </div>
                    <div class="gallery-item-details">
                        <div class="item-text-content">
                            <a href="${data.affiliateUrl}" target="_blank" rel="noopener noreferrer" class="item-name-link">
                                <h3 class="item-name">${data.name}</h3>
                            </a>
                            ${
                                (() => {
                                    if (!data.description) return '';
                                    if (data.description.length > 40) {
                                        const truncated = data.description.substring(0, 40) + '...';
                                        return `<p class="item-desc is-expandable" data-full="${data.description.replace(/"/g, '&quot;')}" data-truncated="${truncated}">${truncated}</p>`;
                                    }
                                    return `<p class="item-desc">${data.description}</p>`;
                                })()
                            }
                        </div>
                        <div class="item-footer">
                            <span class="item-date">${releaseDate}</span>
                            <a href="${data.affiliateUrl}" class="btn-view" target="_blank" rel="noopener noreferrer">View Content</a>
                        </div>
                    </div>
                `;

                // NEW: Add click listener for the modal popup
                const img = itemArticle.querySelector('.gallery-item-img');
                if (img && modal && modalImg) {
                    img.addEventListener('click', () => {
                        modal.style.display = "block";
                        modalImg.src = img.src;
                    });
                }

                galleryContainer.appendChild(itemArticle);
            });

            // Use a short timeout to ensure the browser has rendered the elements before we check their height.
            // This reliably fixes the race condition with font loading and layout reflow.
            setTimeout(() => {
                galleryContainer.querySelectorAll('.item-desc.is-expandable').forEach(desc => {
                    const toggleExpand = (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const p = e.currentTarget;
                        p.classList.toggle('expanded');
                        if (p.classList.contains('expanded')) {
                            p.textContent = p.dataset.full;
                        } else {
                            p.textContent = p.dataset.truncated;
                        }
                    };
                    if (!desc.dataset.expandListener) {
                        desc.addEventListener('click', toggleExpand);
                        desc.dataset.expandListener = 'true';
                    }
                });

                // Re-apply mouse follower effects AFTER the .is-expandable class has been added.
                applyMouseFollowerEffects();

            }, 100); // 100ms delay is a safe value.

            // Setup pagination for the newly created items
            allItems = Array.from(galleryContainer.querySelectorAll('.gallery-item'));
            const totalPages = Math.ceil(allItems.length / limit);
            createPaginationButtons(totalPages);
            if (totalPages > 0) showPage(1);
        }

        function updateDisplay() {
            let processedData = [...masterGalleryData];
            const searchTerm = searchBar ? searchBar.value.toLowerCase() : '';

            // 1. Filter by search term
            if (searchTerm) {
                processedData = processedData.filter(item => 
                    item.name && item.name.toLowerCase().includes(searchTerm)
                );
            }

            // 2. Sort the data
            if (currentSort === 'date') {
                if (dateSortDirection === 'desc') {
                    processedData.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)); // Newest first
                } else { // 'asc'
                    processedData.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)); // Oldest first
                }
            } else if (currentSort === 'name') {
                if (nameSortDirection === 'asc') {
                    processedData.sort((a, b) => (a.name || '').localeCompare(b.name || '')); // A-Z
                } else { // 'desc'
                    processedData.sort((a, b) => (b.name || '').localeCompare(a.name || '')); // Z-A
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
                updateDisplay(); // Initial render with default sorting

            } catch (error) {
                console.error("Error fetching gallery:", error);
                galleryContainer.innerHTML = '<p class="gallery-message">Failed to load gallery content.</p>';
            }
        }

        fetchAndDisplayGallery();

        if (searchBar && sortDateBtn && sortNameBtn) {
            // Set initial button state to show the default sort direction
            sortDateBtn.innerHTML = `Date <span class="sort-arrow">&darr;</span>`; // Active by default
            sortNameBtn.innerHTML = `Name`; // Inactive, no arrow

            // Add event listeners for controls
            searchBar.addEventListener('input', debounce(() => {
                updateDisplay();
            }, 300));

            sortDateBtn.addEventListener('click', () => {
                if (currentSort === 'date') {
                    dateSortDirection = dateSortDirection === 'desc' ? 'asc' : 'desc';
                } else {
                    currentSort = 'date';
                    dateSortDirection = 'desc';
                }
                sortDateBtn.innerHTML = `Date <span class="sort-arrow">${dateSortDirection === 'desc' ? '&darr;' : '&uarr;'}</span>`;
                sortNameBtn.innerHTML = 'Name';
                sortDateBtn.classList.add('active');
                sortNameBtn.classList.remove('active');
                updateDisplay();
            });

            sortNameBtn.addEventListener('click', () => {
                if (currentSort === 'name') {
                    nameSortDirection = nameSortDirection === 'asc' ? 'desc' : 'asc';
                } else {
                    currentSort = 'name';
                    nameSortDirection = 'asc';
                }
                sortNameBtn.innerHTML = `Name <span class="sort-arrow">${nameSortDirection === 'asc' ? '&uarr;' : '&darr;'}</span>`;
                sortDateBtn.innerHTML = 'Date';
                sortNameBtn.classList.add('active');
                sortDateBtn.classList.remove('active');
                updateDisplay();
            });
        }
    }
});