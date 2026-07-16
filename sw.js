const CACHE_VERSION = 'ai-prof-pwa-20260716-official-email-files-1';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const STATIC_ASSETS = [
  './offline.html',
  './login.css?v=20260702-billing-modal-1',
  './style.css?v=20260709-camera-touch-only-1',
  './mobile-menu.css?v=20260709-sidebar-scroll-1',
  './activity-pagination.css',
  './report-type-badge.css',
  './experience-fields.css',
  './brand-logo.css',
  './user-profile.css?v=20260716-ai-provider-select-1',
  './billing-lock.css?v=20260703-billing-lock-3',
  './marketing-notice.css?v=20260702-marketing-notice-list-1',
  './terms-consent.css?v=20260716-terms-link-1',
  './google-drive-integration.css?v=20260716-drive-pairs-1',
  './master-users.css?v=20260705-billing-cycles-1',
  './finance-admin.css?v=20260703-finance-due-filter-1',
  './ai-usage-admin.css?v=20260716-ai-usage-1',
  './image-editors.css?v=20260709-activity-photo-picker-front-1',
  './document-style.css?v=20260706-paragraph-indent-1',
  './tutorial-videos.css?v=20260706-video-before-onboarding-2',
  './document-image-zoom.css?v=20260702-document-image-zoom-front-1',
  './onboarding.css?v=20260703-initial-setup-lock-1',
  './onboarding.js?v=20260715-onboarding-draft-1',
  './activities-edit.js?v=20260709-mobile-camera-only-1',
  './experience-fields.js?v=20260709-mobile-camera-only-1',
  './modal-controls.js?v=20260715-onboarding-draft-1',
  './app.js?v=20260715-keep-current-menu-1',
  './report-editor.js?v=20260715-deliver-keeps-done-1',
  './document-style-settings.js?v=20260716-force-docx-font-1',
  './text-ai-review.js?v=20260716-email-no-ai-1',
  './director-email.js?v=20260716-official-email-files-1',
  './terms-consent.js?v=20260716-terms-fast-accept-1',
  './auth-profile.js?v=20260716-fast-admin-menu-1',
  './google-drive-integration.js?v=20260716-official-email-files-1',
  './tutorial-videos.js?v=20260706-video-before-onboarding-2',
  './manual-image-editor.js?v=20260709-activity-photos-30-1',
  './image-editor-flow.js?v=20260709-activity-photos-30-1',
  './master-users.js?v=20260716-fast-admin-menu-1',
  './ai-usage-admin.js?v=20260716-ai-usage-1',
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
