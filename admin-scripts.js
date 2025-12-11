const AppConfig = {
    // The backend has been removed. This file is no longer functional.
    backendUrl: ''
};

document.addEventListener('DOMContentLoaded', () => {
    const messageEl = document.getElementById('message');
    if (messageEl) {
        messageEl.textContent = 'Admin panel is disabled. The backend has been removed.';
    }
    // Hide forms that are no longer functional
    document.getElementById('login-form')?.remove();
    document.getElementById('upload-form')?.remove();
    document.getElementById('management-container')?.remove();
});
