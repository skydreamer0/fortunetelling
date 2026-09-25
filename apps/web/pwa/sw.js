/*
 * Service worker for the installed (PWA) app. Built by pwa/plugin.ts, which fills in
 * the cache version and precache list below from the production bundle.
 *
 * - App shell and hashed assets are precached, so the app opens offline on iPhone home screen.
 * - Navigations are network-first so a new deploy shows up on the next launch.
 * - Google Fonts are cached at runtime (stale-while-revalidate); without them the system fonts apply.
 */

const VERSION = __PWA_VERSION__;
const PRECACHE = `fortune-precache-${VERSION}`;
const RUNTIME = 'fortune-runtime-v1';
const PRECACHE_URLS = __PWA_PRECACHE__;
const FONT_HOSTS = new Set(['fonts.googleapis.com', 'fonts.gstatic.com']);
const SCOPE = new URL(self.registration.scope);
const SHELL = new URL('index.html', SCOPE).href;

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(PRECACHE)
      .then(cache => cache.addAll(PRECACHE_URLS.map(path => new URL(path, SCOPE).href)))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys
        .filter(key => key.startsWith('fortune-precache-') && key !== PRECACHE)
        .map(key => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  if (request.mode === 'navigate' && url.origin === SCOPE.origin) {
    event.respondWith(networkFirstShell(request));
  } else if (url.origin === SCOPE.origin) {
    event.respondWith(cacheFirst(request));
  } else if (FONT_HOSTS.has(url.hostname)) {
    event.respondWith(staleWhileRevalidate(request, event));
  }
});

/** On a slow connection, fall back to the cached shell instead of a blank screen. */
const NAVIGATION_TIMEOUT_MS = 3500;

async function networkFirstShell(request) {
  const network = fetch(request).then(async response => {
    if (response.ok) {
      const cache = await caches.open(PRECACHE);
      await cache.put(SHELL, response.clone());
    }
    return response;
  });
  network.catch(() => undefined); // Settled below or superseded by the cached shell.
  const timeout = new Promise(resolve => setTimeout(resolve, NAVIGATION_TIMEOUT_MS));
  try {
    const response = await Promise.race([network, timeout]);
    if (response) return response;
    return (await caches.match(SHELL)) ?? (await network);
  } catch {
    return (await caches.match(SHELL)) ?? Response.error();
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request, { ignoreSearch: true });
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(RUNTIME);
    await cache.put(request, response.clone());
  }
  return response;
}

async function staleWhileRevalidate(request, event) {
  const cache = await caches.open(RUNTIME);
  const cached = await cache.match(request);
  const refresh = fetch(request)
    .then(response => {
      if (response.ok || response.type === 'opaque') return cache.put(request, response.clone()).then(() => response);
      return response;
    })
    .catch(() => cached ?? Response.error());
  if (cached) {
    event.waitUntil(refresh.then(() => undefined, () => undefined));
    return cached;
  }
  return refresh;
}
