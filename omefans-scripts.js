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
                item.style.display = 'flex';
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

        async function fetchAndDisplayGallery() {
            // Show a loading message while fetching data.
            galleryContainer.innerHTML = '<p class="gallery-message">Loading gallery...</p>';

            try {
                const response = await fetch(`${AppConfig.backendUrl}/api/gallery`);
                if (!response.ok) throw new Error('Network response was not ok');
                const galleryData = await response.json();

                // Handle the case where the gallery is empty.
                if (galleryData.length === 0) {
                    galleryContainer.innerHTML = '<p class="gallery-message">The gallery is currently empty.</p>';
                    paginationControls.style.display = 'none';
                    return;
                }

                galleryContainer.innerHTML = ''; // Clear any static HTML content

                // Create gallery items dynamically from server data
                galleryData.forEach(data => {
                    const itemLink = document.createElement('a');
                    itemLink.href = data.affiliate_url;
                    itemLink.className = 'gallery-item';
                    itemLink.target = '_blank';
                    itemLink.rel = 'noopener noreferrer';

                    itemLink.innerHTML = `
                        <img src="${data.image_path}" alt="Gallery Content" loading="lazy">
                        <div class="overlay"><span>View Product</span></div>
                    `;
                    galleryContainer.appendChild(itemLink);
                });

                // Re-apply mouse follower effects to the new dynamic items
                applyMouseFollowerEffects();

                // Setup pagination for the newly created items
                allItems = Array.from(galleryContainer.querySelectorAll('.gallery-item'));
                const totalPages = Math.ceil(allItems.length / limit);
                createPaginationButtons(totalPages);
                if (totalPages > 0) showPage(1);

            } catch (error) {
                console.error("Error fetching gallery:", error);
                galleryContainer.innerHTML = '<p class="gallery-message">Failed to load gallery content.</p>';
            }
        }

        fetchAndDisplayGallery();
    }
});

// It's best practice to define styles in a CSS file, but for dynamic elements,
// we can inject the necessary styles into the document head.
const utilityStyles = document.createElement('style');
utilityStyles.textContent = `
    .gallery-message { color: white; text-align: center; width: 100%; }
    .ripple {
        position: absolute;
        width: 20px; height: 20px;
        background: rgba(255, 255, 255, 0.4);
        border-radius: 50%;
        transform: translate(-50%, -50%);
    }
`;
document.head.appendChild(utilityStyles);