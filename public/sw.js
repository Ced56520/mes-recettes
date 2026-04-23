const CACHE = 'papa-poulpe-v045';
const ASSETS = [
  '/',
  '/index.html',
  '/styles.css',
  '/app.js',
  '/manifest.webmanifest',
  '/assets/favicon-32.png',
  '/assets/app-icon-192.png',
  '/assets/app-icon-512.png',
  '/assets/papa-poulpe-chef-v2.png'
];
self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;
  e.respondWith(caches.match(req).then(cached => cached || fetch(req).then(r => {
    if (r && r.ok) caches.open(CACHE).then(c => c.put(req, r.clone()));
    return r;
  })));
});
