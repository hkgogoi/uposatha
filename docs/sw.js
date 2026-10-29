/* Uposatha v17: portable static hosting, including GitHub Pages project paths. */
const RELEASE = 'v17-f73769b470a75a39';
const BASE = new URL(self.registration.scope);
const CACHE_PREFIX = 'uposatha-pages-' + encodeURIComponent(BASE.pathname) + '-';
const CACHE = CACHE_PREFIX + RELEASE;
const localURL = path => new URL(path, BASE).href;
const ASSETS = ['./index.html', './manifest.webmanifest', './icon.svg', './icon-192.png',
  './icon-512.png', './buddha-garden.webp', './meditation-music.mp3', './namo-tassa.mp3',
  './AUDIO_CREDITS.txt'];
const MANIFEST = localURL('./offline-assets.json');

function validAssets(assets) {
  return Array.isArray(assets) && assets.length > 0 && new Set(assets).size === assets.length &&
    assets.every(path => typeof path === 'string' &&
      /^\.\/(?:assets\/[A-Za-z0-9_][A-Za-z0-9_.-]*|audio\/[A-Za-z0-9_][A-Za-z0-9_.-]*\.mp3)$/.test(path));
}

self.addEventListener('install', event => event.waitUntil((async () => {
  // Activate only after the complete app and audio collection are downloaded.
  const response = await fetch(MANIFEST, {cache: 'no-store'});
  if (!response.ok) throw new Error('Offline asset list is unavailable');
  const assets = await response.json();
  if (!validAssets(assets)) throw new Error('Invalid offline asset list');
  const cache = await caches.open(CACHE);
  await cache.addAll([...ASSETS, ...assets].map(path => new Request(localURL(path), {cache: 'reload'})));
  const shell = await cache.match(localURL('./index.html'));
  const html = await shell.text();
  const shellAssets = [...html.matchAll(/(?:src|href)=["'](\.\/assets\/[^"']+)["']/g)].map(match => match[1]);
  if (!shellAssets.length || shellAssets.some(path => !assets.includes(path))) {
    throw new Error('The app is being updated; try again shortly');
  }
  await cache.put(MANIFEST, new Response(JSON.stringify(assets), {headers: {'Content-Type': 'application/json'}}));
  await self.skipWaiting();
})()));

self.addEventListener('activate', event => event.waitUntil((async () => {
  // Different GitHub project sites share an origin. Clean only this app's scope.
  for (const key of await caches.keys()) {
    if (key.startsWith(CACHE_PREFIX) && key !== CACHE) await caches.delete(key);
  }
  await self.clients.claim();
})()));

self.addEventListener('message', event => {
  if (event.data?.type !== 'CHECK_OFFLINE_READY' || !event.ports?.[0]) return;
  event.waitUntil((async () => {
    let ready = false;
    try {
      const cache = await caches.open(CACHE);
      const manifest = await cache.match(MANIFEST);
      const assets = manifest ? await manifest.json() : null;
      if (validAssets(assets)) {
        ready = (await Promise.all([...ASSETS, ...assets].map(path => cache.match(localURL(path))))).every(Boolean);
      }
    } catch { /* Storage may have been cleared or evicted by the device. */ }
    event.ports[0].postMessage({type: 'OFFLINE_STATUS', ready});
  })());
});

function rangedResponse(response, range) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
  if (!match || (!match[1] && !match[2])) return response;
  return response.arrayBuffer().then(buffer => {
    const length = buffer.byteLength;
    const start = match[1] ? Number(match[1]) : Math.max(0, length - Number(match[2]));
    const end = match[1] ? (match[2] ? Math.min(Number(match[2]), length - 1) : length - 1) : length - 1;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start >= length || end < start) {
      return new Response(null, {status: 416, headers: {'Content-Range': 'bytes */' + length}});
    }
    return new Response(buffer.slice(start, end + 1), {status: 206, headers: {
      'Content-Type': response.headers.get('content-type') || 'application/octet-stream',
      'Content-Range': `bytes ${start}-${end}/${length}`, 'Content-Length': String(end - start + 1), 'Accept-Ranges': 'bytes'
    }});
  });
}

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== BASE.origin || !url.pathname.startsWith(BASE.pathname)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    if (request.mode === 'navigate') {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      try {
        const response = await fetch(request, {cache: 'no-store', signal: controller.signal});
        if (response.ok) return response;
      } catch { /* Open the complete cached app when offline. */ }
      finally { clearTimeout(timeout); }
      return await cache.match(localURL('./index.html')) || new Response('Connect to the internet to load Uposatha.', {
        status: 503, headers: {'Content-Type': 'text/plain; charset=utf-8'}
      });
    }
    if (url.pathname === new URL(MANIFEST).pathname) {
      try { return await fetch(request, {cache: 'no-store'}); }
      catch { return await cache.match(MANIFEST) || new Response('Unavailable offline', {status: 503}); }
    }
    const hit = await cache.match(request);
    if (hit) return request.headers.has('range') ? rangedResponse(hit, request.headers.get('range')) : hit;
    try { return await fetch(request); }
    catch { return new Response('Unavailable offline', {status: 503}); }
  })());
});

