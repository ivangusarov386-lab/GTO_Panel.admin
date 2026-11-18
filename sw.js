'use strict';

const scope = self.registration.scope;
const cachePrefix = 'gto-offline:' + scope + ':';
const cacheName = cachePrefix + '1';
const offlinePage = new URL('offline.html', scope).href;
const pages = new Set(['', 'dashboard.html', 'index.html', 'results.html']
  .map(path => new URL(path, scope).pathname));

self.addEventListener('install', event => {
  event.waitUntil(caches.open(cacheName).then(cache =>
    cache.add(new Request(offlinePage, { cache: 'reload' }))
  ));
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names
      .filter(name => name.startsWith(cachePrefix) && name !== cacheName)
      .map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET' || request.mode !== 'navigate') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !pages.has(url.pathname)) return;

  // Сетевые ответы приложения и Google Таблиц не сохраняются.
  event.respondWith(fetch(request).catch(async () =>
    (await (await caches.open(cacheName)).match(offlinePage)) || Response.error()
  ));
});
