const AppConfig = {
    // IMPORTANT: Replace this URL with your actual Render backend URL.
    backendUrl: 'https://api.omefans.com'
};

document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('login-form');
    const uploadForm = document.getElementById('upload-form');
    const passwordInput = document.getElementById('password');
    const messageEl = document.getElementById('message');

    let adminPassword = '';

    loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        adminPassword = passwordInput.value;
        // Simple check. In a real app, you'd verify this with the server.
        if (adminPassword) {
            loginForm.style.display = 'none';
            uploadForm.style.display = 'block';
            messageEl.textContent = 'Logged in. You can now add content.';
        }
    });

    uploadForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        messageEl.textContent = 'Adding content...';

        const data = {
            password: adminPassword,
            name: document.getElementById('name').value,
            description: document.getElementById('description').value,
            imageUrl: document.getElementById('imageUrl').value,
            affiliateUrl: document.getElementById('affiliateUrl').value
        };

        try {
            const response = await fetch(`${AppConfig.backendUrl}/api/upload`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(data),
            });

            const result = await response.json();

            if (response.ok) {
                messageEl.textContent = 'Content added successfully!';
                uploadForm.reset();
            } else {
                throw new Error(result.error || 'Failed to add content.');
            }
        } catch (error) {
            messageEl.textContent = `Error: ${error.message}`;
            console.error(error);
        }
    });
});
