// Daymark service worker: keeps the app opening fast and lets it start offline.
// Only same-site files are cached. Your data (Supabase) is never cached.
const CACHE = 'daymark-v5';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  event.respondWith(
    fetch(req)
      .then(res => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
        return res;
      })
      .catch(() => caches.match(req).then(hit => hit || caches.match('/'))),
  );
});

// Future background push compatibility; a server subscription is still required.
self.addEventListener('push', event => {
  if (!event.data) return;
  let payload;
  try { payload = event.data.json(); } catch { return; }
  if (typeof payload?.title !== 'string') return;
  event.waitUntil(self.registration.showNotification(payload.title, {
    body: typeof payload.body === 'string' ? payload.body : '',
    icon: '/icon-192.png',
    tag: typeof payload.tag === 'string' ? payload.tag : 'daymark-reminder',
  }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(self.clients.openWindow('/'));
});
