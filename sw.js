const SHELL_CACHE = 'serien-login-v1';
const APP_CACHE = 'vault-app';
const SHELL = ['./', './index.html', './login.css?v=1', './login.js?v=1', './vault-crypto.js?v=1', './repo-sync.js?v=1', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png'];

self.addEventListener('install', e =>
{
  e.waitUntil(caches.open(SHELL_CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e =>
{
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('serien-login-') && k !== SHELL_CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

async function serveApp(req, url, scope)
{
  let key = url.origin + url.pathname;
  if (key.endsWith('/')) { key += 'index.html'; }
  const cache = await caches.open(APP_CACHE);
  const hit = await cache.match(key);
  if (hit) { return hit; }
  if (req.mode === 'navigate') { return Response.redirect(scope, 302); }
  return new Response('Nicht gefunden', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}

async function networkFirst(req)
{
  try
  {
    const res = await fetch(req, { cache: 'no-cache' });
    if (res.ok && !req.url.includes('users.json')) { const copy = res.clone(); caches.open(SHELL_CACHE).then(c => c.put(req, copy)); }
    return res;
  }
  catch
  {
    const hit = await caches.match(req, { ignoreSearch: true });
    if (hit) { return hit; }
    throw new Error('offline');
  }
}

self.addEventListener('fetch', e =>
{
  const req = e.request;
  if (req.method !== 'GET') { return; }
  const url = new URL(req.url);
  const scope = self.registration.scope;
  if (url.origin !== self.location.origin || !url.href.startsWith(scope)) { return; }
  if (url.href.startsWith(scope + 'app/')) { e.respondWith(serveApp(req, url, scope)); return; }
  e.respondWith(networkFirst(req));
});
