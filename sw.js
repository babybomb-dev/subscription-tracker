const CACHE_NAME = 'subtracker-v5';
const urlsToCache = [
  './',
  './index.html',
  './firebase-config.js',
  './manifest.json',
  './icon.svg',
  './style.css',
  './js/main.js',
  './js/components/ui.js',
  './js/components/calendar.js',
  './js/components/chart.js',
  './js/components/notifications.js',
  './js/components/settings.js',
  './js/components/splitBill.js',
  './js/components/achievements.js',
  './js/services/auth.js',
  './js/services/database.js',
  './js/utils/helpers.js',
  './js/utils/access.js',
  './js/pwa.js',
  './js/export.js',
  './js/promptpay.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        return cache.addAll(urlsToCache);
      })
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Network First strategy
self.addEventListener('fetch', event => {
  // Only cache same-origin requests (exclude firebase / api calls)
  if (!event.request.url.startsWith(self.location.origin)) {
    return;
  }

  event.respondWith(
    fetch(event.request).then(response => {
      // Network success: cache a copy
      return caches.open(CACHE_NAME).then(cache => {
        cache.put(event.request, response.clone());
        return response;
      });
    }).catch(() => {
      // Network failure: fallback to cache
      return caches.match(event.request).then(response => {
        if (response) {
          return response;
        }
        return new Response('Offline Mode', { status: 503, statusText: 'Service Unavailable' });
      });
    })
  );
});
