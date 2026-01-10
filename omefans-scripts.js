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

    /* --- REPORT MODAL SETUP --- */
    const reportModal = document.getElementById('reportModal');
    const closeReportBtn = document.querySelector('.close-report');
    const reportItemNameEl = document.getElementById('reportItemName');
    const btnReportLink = document.getElementById('btn-report-link');
    const btnReportVideo = document.getElementById('btn-report-video');
    let currentReportItem = '';
    let currentReportAffiliateUrl = '';
    let currentReportImageUrl = '';

    if (reportModal && closeReportBtn) {
        const closeReport = () => {
            reportModal.style.display = "none";
            currentReportItem = '';
        };
        closeReportBtn.addEventListener('click', closeReport);
        reportModal.addEventListener('click', (e) => {
            if (e.target === reportModal) closeReport();
        });
        
        // Helper to send report
        const sendReport = async (category) => {
            if (!currentReportItem) return;
            const btn = category === 'Link Broken' ? btnReportLink : btnReportVideo;
            const originalContent = btn.innerHTML;
            btn.innerHTML = '<span>Sending...</span>';
            btn.style.pointerEvents = 'none';
            
            try {
                const response = await fetch(`${AppConfig.backendUrl}/api/report`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        itemName: currentReportItem,
                        category: category,
                        affiliateUrl: currentReportAffiliateUrl,
                        imageUrl: currentReportImageUrl
                    })
                });

                if (response.ok) {
                    alert('Report sent successfully. Thank you!');
                    closeReport();
                } else {
                    const data = await response.json();
                    alert(data.error || 'Failed to send report. Please try again.');
                }
            } catch (error) {
                console.error('Report error:', error);
                alert('Error sending report.');
            } finally {
                btn.innerHTML = originalContent;
                btn.style.pointerEvents = 'auto';
            }
        };

        if (btnReportLink) btnReportLink.addEventListener('click', () => sendReport('Link Broken'));
        if (btnReportVideo) btnReportVideo.addEventListener('click', () => sendReport('Video Removed'));
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
        const fragment = document.createDocumentFragment();
        for (let i = 0; i < 40; i++) { // OPTIMIZATION: Reduced stars from 100 to 40
            const star = document.createElement('div');
            star.className = 'star';
            star.style.left = Math.random() * 100 + '%';
            star.style.top = Math.random() * 100 + '%';
            star.style.animationDelay = Math.random() * 3 + 's';
            star.style.animationDuration = (Math.random() * 3 + 2) + 's';
            fragment.appendChild(star);
        }
        starsContainer.appendChild(fragment);
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

    let isScrolling = false;
    window.addEventListener('scroll', () => {
        if (!isScrolling) {
            window.requestAnimationFrame(() => {
                if (window.scrollY > 300) backToTopBtn.classList.add('show');
                else backToTopBtn.classList.remove('show');
                isScrolling = false;
            });
            isScrolling = true;
        }
    });

    backToTopBtn.addEventListener('click', () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });

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

    // OPTIMIZATION: Event Delegation for Modal (Single listener instead of one per image)
    if (galleryContainer && modal && modalImg) {
        galleryContainer.addEventListener('click', async (e) => {
            if (e.target.classList.contains('gallery-item-img')) {
                modal.style.display = "block";
                modalImg.src = e.target.src;
            }

            // Report Button Logic (Direct to Webhook)
            const reportBtn = e.target.closest('.report-link-btn');
            if (reportBtn) {
                e.preventDefault();
                e.stopPropagation();
                const itemName = reportBtn.dataset.itemName;
                let affiliateUrl = reportBtn.dataset.affiliateUrl;
                let imageUrl = reportBtn.dataset.imageUrl;

                // Fallback: If attributes are missing or undefined, look up in masterGalleryData
                if ((!affiliateUrl || affiliateUrl === 'undefined' || affiliateUrl === 'null') && typeof masterGalleryData !== 'undefined') {
                    const item = masterGalleryData.find(i => i.name === itemName);
                    if (item) {
                        affiliateUrl = item.affiliateUrl;
                        imageUrl = item.imageUrl;
                    }
                }

                if (reportModal && reportItemNameEl) {
                    currentReportItem = itemName;
                    currentReportAffiliateUrl = affiliateUrl;
                    currentReportImageUrl = imageUrl;
                    reportItemNameEl.textContent = `Reporting: ${itemName}`;
                    reportModal.style.display = "block";
                }
            }
        });
    }

    // OPTIMIZATION: Handle resize for expandable text
    window.addEventListener('resize', debounce(() => {
        if (!galleryContainer) return;
        const descriptions = galleryContainer.querySelectorAll('.item-desc');
        descriptions.forEach(desc => {
            // If already expanded, skip to prevent collapsing
            if (desc.classList.contains('expanded')) return;

            if (desc.scrollHeight > desc.clientHeight) {
                desc.classList.add('is-expandable');
                if (!desc.dataset.expandListener) {
                    desc.addEventListener('click', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        e.currentTarget.classList.toggle('expanded');
                    });
                    desc.dataset.expandListener = 'true';
                }
            } else {
                desc.classList.remove('is-expandable');
            }
        });
    }, 200));

    // OPTIMIZATION: Unified function for toggling descriptions
    function toggleDescription(e) {
        e.preventDefault();
        e.stopPropagation();
        e.currentTarget.classList.toggle('expanded');
    }

    if (galleryContainer && paginationControls) {
        const limit = 9;
        let currentFilteredItems = []; // Holds the data objects for the current view

        function createPaginationButtons(totalPages) {
            paginationControls.innerHTML = '';
            if (totalPages > 1) {
                paginationControls.style.display = '';
                const fragment = document.createDocumentFragment();
                for (let i = 1; i <= totalPages; i++) {
                    const btn = document.createElement('button');
                    btn.innerText = i;
                    btn.className = 'pagination-btn';
                    btn.dataset.page = i; // Store page number in data attribute
                    if (i === 1) btn.classList.add('active');
                    fragment.appendChild(btn);
                }
                paginationControls.appendChild(fragment);
            } else {
                paginationControls.style.display = 'none';
            }
        }

        // OPTIMIZATION: Event Delegation for Pagination (One listener for all buttons)
        paginationControls.addEventListener('click', (e) => {
            if (e.target.classList.contains('pagination-btn')) {
                const page = parseInt(e.target.dataset.page);
                if (!isNaN(page)) renderPage(page);
            }
        });

        function renderPage(pageNumber) {
            galleryContainer.innerHTML = ''; // Clear previous content

            const start = (pageNumber - 1) * limit;
            const end = pageNumber * limit;
            const pageItems = currentFilteredItems.slice(start, end);

            if (pageItems.length === 0 && currentFilteredItems.length === 0) {
                 galleryContainer.innerHTML = '<p class="gallery-message">No items match your search.</p>';
                return;
            }

            const fragment = document.createDocumentFragment();

            pageItems.forEach(data => {
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
                            <div style="display: flex; align-items: center; gap: 10px;">
                                <button class="report-link-btn" data-item-name="${data.name}" data-affiliate-url="${data.affiliateUrl}" data-image-url="${data.imageUrl}" title="Report Broken Link" style="background: none; border: none; padding: 0; cursor: pointer; color: #ff4444; display: flex; align-items: center; opacity: 0.8; transition: opacity 0.2s;" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0.8">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
                                </button>
                                <a href="${data.affiliateUrl}" class="btn-view" target="_blank" rel="noopener noreferrer">View</a>
                            </div>
                        </div>
                    </div>
                `;

                fragment.appendChild(itemArticle);
            });

            galleryContainer.appendChild(fragment);

            // Check for expandable descriptions after render
            requestAnimationFrame(() => {
                galleryContainer.querySelectorAll('.item-desc').forEach(desc => {
                    // Check if the description is overflowing its container
                    if (desc.scrollHeight > desc.clientHeight) {
                        desc.classList.add('is-expandable');
                        
                        // Remove existing listener to be safe, then add the unified one
                        desc.removeEventListener('click', toggleDescription);
                        desc.addEventListener('click', toggleDescription);
                    }
                });

                // Re-apply mouse follower effects AFTER the .is-expandable class has been added.
                applyMouseFollowerEffects();

            });

            // Update active button state
            const btns = paginationControls.querySelectorAll('.pagination-btn');
            btns.forEach(btn => {
                btn.classList.remove('active');
                if (parseInt(btn.innerText) === pageNumber) btn.classList.add('active');
            });
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

            // 4. Update state and render
            currentFilteredItems = processedData;
            const totalPages = Math.ceil(currentFilteredItems.length / limit);
            createPaginationButtons(totalPages);
            
            if (totalPages > 0) {
                renderPage(1);
            } else {
                galleryContainer.innerHTML = '<p class="gallery-message">No items match your search.</p>';
                paginationControls.style.display = 'none';
            }
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

    /* --- 6. CONTACT FORM HANDLING --- */
    const contactForm = document.getElementById('contact-form');
    const formStatus = document.getElementById('form-status');

    // Pre-fill form based on URL parameters (e.g. from Report button)
    if (contactForm) {
        const urlParams = new URLSearchParams(window.location.search);
        const categoryParam = urlParams.get('category');
        const itemParam = urlParams.get('item');

        if (categoryParam) {
            const categorySelect = document.getElementById('category');
            if (categorySelect) categorySelect.value = categoryParam;
        }
        if (itemParam) {
            const messageBox = document.getElementById('request');
            if (messageBox) messageBox.value = `The link for "${itemParam}" seems to be broken. Please check it.`;
        }
    }

    if (contactForm && formStatus) {
        contactForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const submitBtn = contactForm.querySelector('button[type="submit"]');
            const originalBtnText = submitBtn.innerText;
            submitBtn.disabled = true;
            submitBtn.querySelector('span').innerText = 'Sending...';
            formStatus.style.display = 'none';

            const formData = {
                name: document.getElementById('name').value,
                message: document.getElementById('request').value,
                category: document.getElementById('category') ? document.getElementById('category').value : 'General'
            };

            try {
                const response = await fetch(`${AppConfig.backendUrl}/api/contact`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(formData)
                });

                if (response.ok) {
                    formStatus.innerText = 'Request sent successfully!';
                    formStatus.style.color = '#4caf50';
                    formStatus.style.display = 'block';
                    contactForm.reset();
                } else {
                    const data = await response.json();
                    throw new Error(data.error || 'Failed to send');
                }
            } catch (error) {
                console.error('Contact form error:', error);
                formStatus.innerText = error.message || 'Error sending request. Please try again later.';
                formStatus.style.color = '#ff4444';
                formStatus.style.display = 'block';
            } finally {
                submitBtn.disabled = false;
                submitBtn.querySelector('span').innerText = originalBtnText;
            }
        });
    }

    /* --- 7. ANNOUNCEMENT POPUP --- */
    async function checkAnnouncements() {
        try {
            const urlParams = new URLSearchParams(window.location.search);
            const isTest = urlParams.has('test-announcement');

            const response = await fetch(`${AppConfig.backendUrl}/api/announcements/latest`);
            if (!response.ok) return;
            const announcement = await response.json();
            
            // Check if announcement exists and hasn't been seen yet
            if (announcement && announcement.id) {
                const seenId = localStorage.getItem('seen_announcement_id');
                if (isTest || seenId != announcement.id) {
                    showAnnouncementNotification(announcement);
                }
            }
        } catch (e) { console.error('Announcement check failed', e); }
    }

    function showAnnouncementNotification(data) {
        // Create notification container dynamically
        const notification = document.createElement('div');
        notification.className = 'announcement-notification';
        
        // Apply styles directly for top-right positioning
        Object.assign(notification.style, {
            position: 'fixed',
            top: '20px',
            right: '20px',
            width: '320px',
            maxWidth: '90vw',
            backgroundColor: '#0d1117',
            border: '1px solid #30363d',
            borderRadius: '8px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
            zIndex: '99999',
            padding: '15px',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            transform: 'translateX(120%)', // Start off-screen
            transition: 'transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
            fontFamily: "'Inter', sans-serif"
        });

        notification.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                <h3 style="color: #58a6ff; margin: 0; font-size: 1rem; display: flex; align-items: center; gap: 8px;">
                    <span>📢</span> ${data.title}
                </h3>
                <button class="close-announcement" style="background: none; border: none; color: #8b949e; cursor: pointer; padding: 0; font-size: 1.2rem; line-height: 1;">&times;</button>
            </div>
            ${data.imageUrl ? `<img src="${data.imageUrl}" style="width: 100%; border-radius: 4px; object-fit: cover; max-height: 150px;" alt="Announcement">` : ''}
            <div style="color: #c9d1d9; font-size: 0.9rem; line-height: 1.5; max-height: 200px; overflow-y: auto;">${data.message}</div>
            <button id="ack-announcement" style="background: #238636; color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-weight: 600; font-size: 0.85rem; align-self: flex-end;">Got it</button>
        `;
        
        document.body.appendChild(notification);
        
        // Trigger animation
        requestAnimationFrame(() => {
            notification.style.transform = 'translateX(0)';
        });
        
        const close = () => {
            notification.style.transform = 'translateX(120%)';
            setTimeout(() => {
                notification.remove();
                localStorage.setItem('seen_announcement_id', data.id);
            }, 300);
        };
        
        notification.querySelector('.close-announcement').addEventListener('click', close);
        notification.querySelector('#ack-announcement').addEventListener('click', close);
    }

    checkAnnouncements();
});