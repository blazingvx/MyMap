// Service Worker for fast, offline-capable map application
const CACHE_VERSION = 'map-tiles-v1';
const STATIC_CACHE = 'map-static-v1';

// Files to cache on install
const STATIC_FILES = [
    '/',
    '/index.html',
    '/app.js'
];

// Install event - cache static assets
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(STATIC_CACHE)
            .then(cache => cache.addAll(STATIC_FILES).catch(() => {}))
            .then(() => self.skipWaiting())
    );
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames
                    .filter(name => name !== STATIC_CACHE && name !== CACHE_VERSION)
                    .map(name => caches.delete(name))
            );
        })
        .then(() => self.clients.claim())
    );
});

// Fetch event - network first for tiles, cache first for static
self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);
    
    // CartoDB tiles - cache with network fallback
    if (url.hostname.includes('cartocdn.com') || url.pathname.endsWith('.png')) {
        event.respondWith(
            caches.open(CACHE_VERSION).then(cache => {
                return fetch(event.request)
                    .then(response => {
                        if (response && response.status === 200) {
                            cache.put(event.request, response.clone());
                        }
                        return response;
                    })
                    .catch(() => cache.match(event.request));
            })
        );
    }
    // Static assets - cache first with network fallback
    else if (event.request.method === 'GET') {
        event.respondWith(
            caches.open(STATIC_CACHE).then(cache => {
                return cache.match(event.request).then(response => {
                    return response || fetch(event.request).then(response => {
                        if (response && response.status === 200) {
                            cache.put(event.request, response.clone());
                        }
                        return response;
                    }).catch(() => response);
                });
            })
        );
    }
});
