const AppConfig = {
    // The live URL for the Cloudflare Worker backend.
    backendUrl: 'https://omefans-site.omefans.workers.dev'
};

document.addEventListener("DOMContentLoaded", function() {

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
        for (let i = 0; i < 40; i++) { // OPTIMIZATION: Reduced stars from 100 to 40
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
        // OPTIMIZATION: Use requestAnimationFrame for smoother performance
        let mouseX = 0, mouseY = 0;
        let rafId = null;

        document.addEventListener('mousemove', (e) => {
            mouseX = e.clientX;
            mouseY = e.clientY;
            if (!rafId) {
                rafId = requestAnimationFrame(() => {
                    follower.style.left = mouseX + 'px';
                    follower.style.top = mouseY + 'px';
                    rafId = null;
                });
            }
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

    /* --- 5. BACK TO TOP BUTTON --- */
    const backToTopBtn = document.createElement('button');
    backToTopBtn.id = 'backToTopBtn';
    backToTopBtn.innerHTML = '&#8679;'; // Up Arrow
    backToTopBtn.ariaLabel = "Back to Top";
    document.body.appendChild(backToTopBtn);

    window.addEventListener('scroll', () => {
        if (window.scrollY > 300) {
            backToTopBtn.classList.add('show');
        } else {
            backToTopBtn.classList.remove('show');
        }
    });

    backToTopBtn.addEventListener('click', () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    /* --- 6. NEW YEAR FIREWORKS --- */
    const fwCanvas = document.createElement('canvas');
    fwCanvas.style.position = 'fixed';
    fwCanvas.style.top = '0';
    fwCanvas.style.left = '0';
    fwCanvas.style.width = '100%';
    fwCanvas.style.height = '100%';
    fwCanvas.style.pointerEvents = 'none';
    fwCanvas.style.zIndex = '5'; // Behind content (10) but above background
    document.body.appendChild(fwCanvas);

    const ctx = fwCanvas.getContext('2d');
    let fwWidth = fwCanvas.width = window.innerWidth;
    let fwHeight = fwCanvas.height = window.innerHeight;

    window.addEventListener('resize', () => {
        fwWidth = fwCanvas.width = window.innerWidth;
        fwHeight = fwCanvas.height = window.innerHeight;
    });

    class Firework {
        constructor() {
            this.x = Math.random() * fwWidth;
            this.y = fwHeight;
            this.sx = Math.random() * 4 - 2; // Horizontal speed
            this.sy = -(Math.random() * 5 + 8); // Vertical speed (upwards)
            this.size = Math.random() * 2 + 1;
            this.color = `hsl(${Math.random() * 360}, 100%, 50%)`;
            this.age = 0;
            this.maxAge = Math.random() * 20 + 50; // Explode height
            this.exploded = false;
        }
        update() {
            if (this.exploded) return;
            this.x += this.sx;
            this.y += this.sy;
            this.sy += 0.15; // Gravity
            this.age++;
            if (this.sy >= 0 || this.age > this.maxAge) {
                this.exploded = true;
                createParticles(this.x, this.y, this.color);
            }
        }
        draw() {
            if (this.exploded) return;
            ctx.fillStyle = this.color;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    const particles = [];
    class Particle {
        constructor(x, y, color) {
            this.x = x;
            this.y = y;
            const angle = Math.random() * Math.PI * 2;
            const speed = Math.random() * 3 + 1;
            this.vx = Math.cos(angle) * speed;
            this.vy = Math.sin(angle) * speed;
            this.color = color;
            this.alpha = 1;
            this.decay = Math.random() * 0.02 + 0.01;
        }
        update() {
            this.x += this.vx;
            this.y += this.vy;
            this.vy += 0.1; // Gravity
            this.alpha -= this.decay;
        }
        draw() {
            ctx.globalAlpha = this.alpha;
            ctx.fillStyle = this.color;
            ctx.beginPath();
            ctx.arc(this.x, this.y, 2, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1;
        }
    }

    function createParticles(x, y, color) {
        for (let i = 0; i < 40; i++) {
            particles.push(new Particle(x, y, color));
        }
    }

    const fireworks = [];
    function animateFireworks() {
        ctx.clearRect(0, 0, fwWidth, fwHeight);
        
        // Randomly launch fireworks (approx every 60 frames / 1 sec if 0.015)
        if (Math.random() < 0.015) { 
            fireworks.push(new Firework());
        }

        for (let i = fireworks.length - 1; i >= 0; i--) {
            fireworks[i].update();
            fireworks[i].draw();
            if (fireworks[i].exploded) fireworks.splice(i, 1);
        }

        for (let i = particles.length - 1; i >= 0; i--) {
            particles[i].update();
            particles[i].draw();
            if (particles[i].alpha <= 0) particles.splice(i, 1);
        }
        
        requestAnimationFrame(animateFireworks);
    }
    animateFireworks();

    /* --- 4. PAGINATION --- */
    const galleryContainer = document.getElementById('gallery-container');
    const paginationControls = document.getElementById('pagination-controls');
    const searchBar = document.getElementById('search-bar');
    const sortDateBtn = document.getElementById('sort-date-btn');
    const sortNameBtn = document.getElementById('sort-name-btn');
    const filterBtns = document.querySelectorAll('.filter-btn');

    let masterGalleryData = []; // Holds the original full list of items from the server
    let currentSort = 'date'; // 'date' or 'name'
    let dateSortDirection = 'desc'; // 'desc' for recent, 'asc' for older
    let nameSortDirection = 'asc'; // 'asc' for A-Z, 'desc' for Z-A
    let currentCategory = 'all';

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
                paginationControls.style.display = '';
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
                if (data.isFeatured) {
                    itemArticle.classList.add('featured');
                }

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
                                data.description 
                                ? `<p class="item-desc">${data.description}</p>` 
                                : ''
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
                galleryContainer.querySelectorAll('.item-desc').forEach(desc => {
                    // Check if the description is overflowing its container
                    if (desc.scrollHeight > desc.clientHeight) {
                        desc.classList.add('is-expandable');
                        
                        const toggleExpand = (e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            e.currentTarget.classList.toggle('expanded');
                        };

                        // Prevent adding multiple listeners
                        if (!desc.dataset.expandListener) {
                            desc.addEventListener('click', toggleExpand);
                            desc.dataset.expandListener = 'true';
                        }
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

            // 2. Filter by Category
            if (currentCategory !== 'all') {
                processedData = processedData.filter(item => {
                    const cat = (item.category || 'omegle').toLowerCase();
                    return cat === currentCategory;
                });
            }

            // 3. Sort the data (Featured items always come first)
            processedData.sort((a, b) => {
                // Primary sort: featured items first
                if (a.isFeatured && !b.isFeatured) return -1;
                if (!a.isFeatured && b.isFeatured) return 1;

                // Secondary sort: user's choice
                if (currentSort === 'date') {
                    return dateSortDirection === 'desc'
                        ? new Date(b.createdAt) - new Date(a.createdAt)
                        : new Date(a.createdAt) - new Date(b.createdAt);
                } else if (currentSort === 'name') {
                    const nameA = a.name || '';
                    const nameB = b.name || '';
                    return nameSortDirection === 'asc'
                        ? nameA.localeCompare(nameB)
                        : nameB.localeCompare(nameA);
                }
                return 0;
            });

            // 4. Render the processed data
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

            // Category Filter Listeners
            filterBtns.forEach(btn => {
                btn.addEventListener('click', () => {
                    // Update active state
                    filterBtns.forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    // Update filter
                    currentCategory = btn.dataset.category;
                    updateDisplay();
                });
            });
        }
    }
});