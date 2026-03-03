/**
 * ===================================================
 * Mochi — Service Worker
 * ===================================================
 * Cache-first strategy for all static assets.
 * Enables full offline functionality.
 *
 * Cache name is versioned — bump CACHE_VERSION to
 * force re-cache on next visit.
 * ===================================================
 */

var CACHE_VERSION = 1;
var CACHE_NAME = 'mochi-v' + CACHE_VERSION;

/**
 * All files to pre-cache on install.
 * These form the complete offline app.
 */
var PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.json',
  './js/input.js',
  './js/background.js',
  './js/particles.js',
  './js/egg.js',
  './js/creaturePhysics.js',
  './js/creatureAI.js',
  './js/creature.js',
  './js/emotions.js',
  './js/needs.js',
  './js/personality.js',
  './js/audio.js',
  './js/items.js',
  './js/menu.js',
  './js/storage.js',
  './js/notifications.js',
  './js/main.js'
];

// ─────────────────────────────────────────────
// INSTALL — Pre-cache all static assets
// ─────────────────────────────────────────────

self.addEventListener('install', function(event) {
  console.log('[SW] Installing — cache:', CACHE_NAME);

  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function(cache) {
        console.log('[SW] Pre-caching', PRECACHE_URLS.length, 'files');
        return cache.addAll(PRECACHE_URLS);
      })
      .then(function() {
        // Activate immediately (don't wait for old SW to die)
        return self.skipWaiting();
      })
      .catch(function(err) {
        console.warn('[SW] Pre-cache failed:', err.message);
      })
  );
});

// ─────────────────────────────────────────────
// ACTIVATE — Clean up old caches
// ─────────────────────────────────────────────

self.addEventListener('activate', function(event) {
  console.log('[SW] Activating — cleaning old caches');

  event.waitUntil(
    caches.keys()
      .then(function(cacheNames) {
        return Promise.all(
          cacheNames
            .filter(function(name) {
              // Delete any cache that isn't our current version
              return name.startsWith('mochi-') && name !== CACHE_NAME;
            })
            .map(function(name) {
              console.log('[SW] Deleting old cache:', name);
              return caches.delete(name);
            })
        );
      })
      .then(function() {
        // Claim all open clients immediately
        return self.clients.claim();
      })
  );
});

// ─────────────────────────────────────────────
// FETCH — Cache-first, fallback to network
// ─────────────────────────────────────────────

self.addEventListener('fetch', function(event) {
  var request = event.request;

  // Only handle GET requests
  if (request.method !== 'GET') return;

  // Skip chrome-extension and non-http(s) requests
  var url = new URL(request.url);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  // Skip external requests (CDNs, analytics, etc)
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(request)
      .then(function(cachedResponse) {
        if (cachedResponse) {
          // Cache hit — return cached version
          // Also update cache in background (stale-while-revalidate)
          var fetchPromise = fetch(request)
            .then(function(networkResponse) {
              // Only cache valid responses
              if (networkResponse && networkResponse.status === 200) {
                var responseClone = networkResponse.clone();
                caches.open(CACHE_NAME)
                  .then(function(cache) {
                    cache.put(request, responseClone);
                  });
              }
              return networkResponse;
            })
            .catch(function() {
              // Network failed — that's ok, we have cache
            });

          return cachedResponse;
        }

        // Cache miss — try network
        return fetch(request)
          .then(function(networkResponse) {
            // Cache the new response for next time
            if (networkResponse && networkResponse.status === 200) {
              var responseClone = networkResponse.clone();
              caches.open(CACHE_NAME)
                .then(function(cache) {
                  cache.put(request, responseClone);
                });
            }
            return networkResponse;
          })
          .catch(function() {
            // Both cache and network failed
            // Return a minimal offline fallback for HTML requests
            if (request.headers.get('Accept') &&
                request.headers.get('Accept').includes('text/html')) {
              return new Response(
                '<!DOCTYPE html><html><head><meta charset="UTF-8">' +
                '<meta name="viewport" content="width=device-width">' +
                '<title>Mochi</title>' +
                '<style>body{background:#0a0a0f;color:#e0aaff;' +
                'font-family:system-ui;display:flex;justify-content:center;' +
                'align-items:center;height:100vh;margin:0;text-align:center}' +
                '</style></head><body>' +
                '<div><p style="font-size:3rem">💜</p>' +
                '<p>Mochi está durmiendo...</p>' +
                '<p style="color:#666;font-size:0.8rem;margin-top:1rem">' +
                'Sin conexión</p></div></body></html>',
                {
                  status: 200,
                  headers: { 'Content-Type': 'text/html; charset=utf-8' }
                }
              );
            }

            // For non-HTML, return empty response
            return new Response('', { status: 408 });
          });
      })
  );
});

// ─────────────────────────────────────────────
// NOTIFICATION CLICK — Open/focus the app
// ─────────────────────────────────────────────

self.addEventListener('notificationclick', function(event) {
  event.notification.close();

  // Focus existing window or open new one
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(function(clientList) {
        // Try to focus an existing window
        for (var i = 0; i < clientList.length; i++) {
          var client = clientList[i];
          if (client.url && 'focus' in client) {
            return client.focus();
          }
        }
        // No existing window — open new one
        if (self.clients.openWindow) {
          return self.clients.openWindow('./index.html');
        }
      })
  );
});

// ─────────────────────────────────────────────
// MESSAGE — Handle messages from main thread
// ─────────────────────────────────────────────

self.addEventListener('message', function(event) {
  if (!event.data) return;

  switch (event.data.type) {
    case 'SKIP_WAITING':
      self.skipWaiting();
      break;

    case 'SCHEDULE_NOTIFICATION':
      // Schedule a notification after a delay
      var data = event.data;
      if (data.delay && data.title) {
        setTimeout(function() {
          self.registration.showNotification(data.title, {
            body: data.body || '',
            icon: data.icon || '',
            badge: data.badge || '',
            tag: data.tag || 'mochi-default',
            renotify: false,
            silent: data.silent !== false,
            data: { url: './index.html' }
          });
        }, data.delay);
      }
      break;

    case 'CANCEL_NOTIFICATIONS':
      // Close all notifications with matching tag
      self.registration.getNotifications({ tag: event.data.tag || '' })
        .then(function(notifications) {
          notifications.forEach(function(n) { n.close(); });
        });
      break;
  }
});
