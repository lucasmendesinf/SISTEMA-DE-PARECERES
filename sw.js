const CACHE_VERSION = 'ai-prof-pwa-20260705-1';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const STATIC_ASSETS = [
  './offline.html',
  './login.css?v=20260702-billing-modal-1',
  './style.css?v=20260703-final-text-1',
  './mobile-menu.css',
  './activity-pagination.css',
  './report-type-badge.css',
  './experience-fields.css',
  './brand-logo.css',
  './user-profile.css?v=20260703-billing-buttons-1',
  './billing-lock.css?v=20260703-billing-lock-3',
  './marketing-notice.css?v=20260702-marketing-notice-list-1',
  './master-users.css?v=20260702-user-filters-1',
  './finance-admin.css?v=20260703-finance-due-filter-1',
  './image-editors.css',
  './document-style.css',
  './document-image-zoom.css?v=20260702-document-image-zoom-front-1',
  './onboarding.css?v=20260703-initial-setup-lock-1',
  './assets/ai-prof-logo-transparent.png',
  './assets/pwa/icon-192.png',
  './assets/pwa/icon-512.png',
  './assets/pwa/icon-maskable-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key.startsWith('ai-prof-pwa-') && key !== STATIC_CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== location.origin) return;
  if (url.pathname.endsWith('/api.php') || url.pathname.endsWith('/download_pdf.php') || url.pathname.endsWith('/download_parecer.php')) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .catch(() => caches.match('./offline.html'))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request).then(response => {
        if (!response || response.status !== 200 || response.type !== 'basic') return response;
        const copy = response.clone();
        caches.open(STATIC_CACHE).then(cache => cache.put(request, copy));
        return response;
      });
    })
  );
});
