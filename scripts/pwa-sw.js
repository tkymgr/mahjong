/* Built by pwa-build.mjs. All URLs are relative to this app's deployment scope. */
const BUILD_ID = __PWA_BUILD_ID__;
const ASSETS = __PWA_ASSETS__;
const SCOPE = self.registration.scope;
const PREFIX = 'mahjong-pwa:' + new URL(SCOPE).pathname + ':';
const CACHE = PREFIX + BUILD_ID;
const INDEX = new URL('index.html', SCOPE).href;

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    try {
      const cache = await caches.open(CACHE);
      await cache.addAll(ASSETS.map(path => new Request(new URL(path, SCOPE), {cache:'reload'})));
    } catch (error) {
      await caches.delete(CACHE);
      throw error;
    }
  })());
});

async function cleanup() {
  // A second tab may still use an older JS bundle. Retain its cache until a
  // single freshly loaded client confirms it runs this same build.
  if (self.registration.installing || self.registration.waiting) return;
  const windows = await self.clients.matchAll({type:'window',includeUncontrolled:true});
  if (windows.filter(client => client.url.startsWith(SCOPE)).length > 1) return;
  const names = await caches.keys();
  if (self.registration.installing || self.registration.waiting) return;
  await Promise.all(names.filter(name => name.startsWith(PREFIX) && name !== CACHE).map(name => caches.delete(name)));
}

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('message', event => {
  if (event.data?.type === 'ACTIVATE_UPDATE') event.waitUntil(self.skipWaiting());
  if (event.data?.type === 'CLEANUP' && event.data.buildId === BUILD_ID) event.waitUntil(cleanup());
});

// Precached static files are identical across request Origin headers. Preview
// servers may send Vary: Origin; module requests must still hit their snapshot.
async function cached(request) {
  const current = await caches.open(CACHE);
  let response = await current.match(request, {ignoreSearch:true,ignoreVary:true});
  if (response) return response;
  for (const name of await caches.keys()) {
    if (!name.startsWith(PREFIX) || name === CACHE) continue;
    response = await (await caches.open(name)).match(request, {ignoreSearch:true,ignoreVary:true});
    if (response) return response;
  }
  return fetch(request);
}

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url), scope = new URL(SCOPE);
  if (event.request.method !== 'GET' || url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return;
  if (event.request.mode === 'navigate') {
    event.respondWith(caches.open(CACHE).then(cache => cache.match(INDEX)).then(response => response || fetch(event.request)));
  } else {
    event.respondWith(cached(event.request));
  }
});
