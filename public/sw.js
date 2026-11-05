// Kizuna-Zek PWA Service Worker with Robust Offline App Shell Caching
const CACHE_NAME = 'kizuna-zek-shell-v2';

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon.svg',
  '/pwa-192x192.png',
  '/pwa-512x512.png',
  '/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('[PWA SW] Non-critical cache add warning:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  
  // Exclude non-GET requests and AI API endpoints / WebSocket / SSE streams
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  // Bypass AI model endpoints and proxy routes
  if (
    url.pathname.startsWith('/api/') ||
    url.hostname.includes('aliyuncs.com') ||
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('nvidia.com')
  ) {
    return;
  }

  // Handle navigation (HTML) requests - Network First, fallback to cached App Shell
  if (request.mode === 'navigate' || request.destination === 'document') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.status === 200) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put('/', copy));
          }
          return response;
        })
        .catch(async () => {
          const cachedIndex = await caches.match('/index.html') || await caches.match('/');
          if (cachedIndex) return cachedIndex;
          return new Response(
            '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Kizuna-Zek Offline</title><style>body{background:#09090b;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center;padding:20px;}</style></head><body><div><h2 style="font-size:18px;font-weight:600;">Sin conexión a Internet</h2><p style="color:#a1a1aa;font-size:14px;">Kizuna-Zek requiere conexión para generar respuestas de IA, pero tus datos locales están a salvo.</p></div></body></html>',
            { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
          );
        })
    );
    return;
  }

  // For static assets (JS, CSS, images, fonts) - Stale-While-Revalidate or Cache First
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      const fetchPromise = fetch(request)
        .then((networkResponse) => {
          if (networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, responseToCache));
          }
          return networkResponse;
        })
        .catch(() => cachedResponse);

      return cachedResponse || fetchPromise;
    })
  );
});
