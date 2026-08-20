// SIMAK PWA Service Worker (with Luxury Offline Fallback Screen)
const CACHE_NAME = 'simak-offline-v3';
const OFFLINE_URL = '/offline.html';

// Assets to pre-cache for offline fallback
const STATIC_ASSETS = [
  OFFLINE_URL + '?v=3',
  '/logo.png',
  '/manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      // Precache offline page without query params mapping
      const response = await fetch(OFFLINE_URL + '?t=' + Date.now());
      if (response.ok) {
        await cache.put(OFFLINE_URL, response);
      }
      return cache.addAll(['/logo.png', '/manifest.json']);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // Only handle GET requests
  if (event.request.method !== 'GET') return;

  event.respondWith(
    fetch(event.request)
      .catch(async (error) => {
        // If network request failed (server is down or client is offline)
        // Check if the user is trying to navigate to a page/route
        if (event.request.mode === 'navigate') {
          const cache = await caches.open(CACHE_NAME);
          const cachedResponse = await cache.match(OFFLINE_URL);
          if (cachedResponse) {
            return cachedResponse;
          }
        }

        // Check if asset is cached (e.g. logo.png)
        const cachedAsset = await caches.match(event.request);
        if (cachedAsset) {
          return cachedAsset;
        }

        throw error;
      })
  );
});
