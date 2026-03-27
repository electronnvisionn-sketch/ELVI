/**
 * ELECTRON VISION - Service Worker for Push Notifications
 * Handles push notifications and offline support
 */

const CACHE_NAME = 'electron-vision-v1';
const NOTIFICATION_ICON = '/icon-192.png';

// Install event
self.addEventListener('install', (event) => {
  console.log('[SW] Installing Service Worker...');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Cache opened');
      return cache.addAll([
        '/',
        '/index.html',
        '/offline.html'
      ]);
    })
  );
  self.skipWaiting();
});

// Activate event
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating Service Worker...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Push notification event
self.addEventListener('push', (event) => {
  console.log('[SW] Push notification received:', event);
  
  let data = {
    title: 'ELECTRON VISION',
    body: 'لديك إشعار جديد',
    icon: NOTIFICATION_ICON,
    badge: '/badge.png',
    tag: 'electron-vision-notification',
    data: { url: '/' },
    actions: [
      { action: 'open', title: 'فتح' },
      { action: 'close', title: 'إغلاق' }
    ]
  };

  if (event.data) {
    try {
      const pushData = event.data.json();
      data = {
        ...data,
        title: pushData.title || data.title,
        body: pushData.body || data.body,
        icon: pushData.icon || NOTIFICATION_ICON,
        badge: pushData.badge || data.badge,
        tag: pushData.tag || data.tag,
        data: pushData.data || data.data,
        actions: pushData.actions || data.actions
      };
    } catch (e) {
      console.log('[SW] Push data text:', event.data.text());
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body,
    icon: data.icon,
    badge: data.badge,
    tag: data.tag,
    data: data.data,
    actions: data.actions,
    vibrate: [100, 50, 100],
    dir: 'rtl',
    lang: 'ar',
    renotify: true,
    requireInteraction: true
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// Notification click event
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification clicked:', event.action);
  
  event.notification.close();

  if (event.action === 'close') {
    return;
  }

  const urlToOpen = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // If a window is already open, focus it
      for (const client of clientList) {
        if (client.url === urlToOpen && 'focus' in client) {
          return client.focus();
        }
      }
      // Otherwise open a new window
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});

// Background sync for offline support
self.addEventListener('sync', (event) => {
  console.log('[SW] Background sync:', event.tag);
  
  if (event.tag === 'sync-messages') {
    event.waitUntil(syncMessages());
  }
});

async function syncMessages() {
  console.log('[SW] Syncing messages...');
  // Implement message sync logic here
}

// Handle messages from main app
self.addEventListener('message', (event) => {
  console.log('[SW] Message received:', event.data);
  
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

console.log('[SW] Service Worker loaded');