// SIMAK PWA Service Worker (Network-First to ensure hot-reloading & live updates work seamlessly)
const CACHE_NAME = 'simak-pwa-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Always fetch fresh network content so dev server live reloads & server updates are immediate
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
