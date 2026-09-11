/* global self, caches, fetch */

const CACHE_PREFIX = 'olli-pwa-';
const CACHE_NAME = `${CACHE_PREFIX}__OLLI_BUILD_ID__`;
const GENERATED_SHELL = __OLLI_PRECACHE__;
const APP_SHELL = [
  '/',
  '/index.html',
  '/offline.html',
  '/manifest.webmanifest',
  '/pwa-register.js',
  '/favicon.png',
  '/icon-192.png',
  '/icon-512.png',
  ...GENERATED_SHELL,
];
const STATIC_DESTINATIONS = new Set(['script', 'style', 'font', 'image', 'worker']);

function respostaPodeSerCacheada(response) {
  if (!response || !response.ok || response.type !== 'basic') return false;
  const controle = response.headers.get('Cache-Control') || '';
  return !/(?:^|,)\s*(?:no-store|private)(?:\s|,|$)/i.test(controle);
}

function recursoEstaticoPermitido(request, url) {
  if (request.method !== 'GET' || url.origin !== self.location.origin) return false;
  if (STATIC_DESTINATIONS.has(request.destination)) return true;
  return url.pathname.startsWith('/_expo/') || url.pathname.startsWith('/assets/');
}

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
          .map((key) => caches.delete(key)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(async () => (
        await caches.match('/index.html') || await caches.match('/offline.html')
      )),
    );
    return;
  }

  if (!recursoEstaticoPermitido(request, url)) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const armazenado = await cache.match(request);
    if (armazenado) return armazenado;

    const response = await fetch(request);
    if (respostaPodeSerCacheada(response)) {
      await cache.put(request, response.clone());
    }
    return response;
  })());
});
