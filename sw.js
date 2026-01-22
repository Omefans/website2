// sw.js - Service Worker for Push Notifications
self.addEventListener('push', function(event) {
    if (!(self.Notification && self.Notification.permission === 'granted')) {
        return;
    }

    const data = event.data ? event.data.json() : {};
    const title = data.title || "New Content";
    
    // Helper to ensure absolute URLs (Fixes Safari/Firefox icon issues)
    const getAbsoluteUrl = (path) => new URL(path, self.location.origin).href;

    const options = {
        body: data.body || "Check it out!",
        icon: data.icon ? getAbsoluteUrl(data.icon) : getAbsoluteUrl('/images/header-logo.png'),
        image: data.image ? getAbsoluteUrl(data.image) : undefined,
        badge: getAbsoluteUrl('/images/header-logo.png'), // Small icon for Android status bar
        data: { url: data.url || '/' }
    };

    event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', function(event) {
    event.notification.close();
    event.waitUntil(clients.openWindow(event.notification.data.url));
});
