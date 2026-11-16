const API = 'https://api.github.com';
const PARALLEL = 6;
const MANIFEST = '__vault_manifest.json';
const SKIP = [/(^|\/)\./, /\.ps1$/i, /\.md$/i];
const TYPES = {
  html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', mjs: 'text/javascript; charset=utf-8', css: 'text/css; charset=utf-8',
  json: 'application/json; charset=utf-8', webmanifest: 'application/manifest+json; charset=utf-8', txt: 'text/plain; charset=utf-8',
  svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', ico: 'image/x-icon',
  woff: 'font/woff', woff2: 'font/woff2', mp3: 'audio/mpeg', mp4: 'video/mp4'
};

export const APP_CACHE = 'vault-app';

function typeOf(path)
{
  return TYPES[path.split('.').pop().toLowerCase()] || 'application/octet-stream';
}

function encodePath(path)
{
  return path.split('/').map(encodeURIComponent).join('/');
}

async function gh(path, token, raw = false)
{
  const headers = { Authorization: 'Bearer ' + token, Accept: raw ? 'application/vnd.github.raw' : 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
  const res = await fetch(API + path, { headers, cache: 'no-store' });
  if (res.status === 401) { throw new Error('GitHub-Token ungültig oder abgelaufen.'); }
  if (res.status === 403 || res.status === 404) { throw new Error('Kein Zugriff auf das private Repository (Token-Rechte prüfen).'); }
  if (!res.ok) { throw new Error('GitHub-Fehler ' + res.status); }
  return raw ? res : res.json();
}

export function appUrl(base, path = '')
{
  return new URL('app/' + path, base).href;
}

export async function hasApp(base)
{
  const cache = await caches.open(APP_CACHE);
  return !!(await cache.match(appUrl(base, 'index.html')));
}

export async function clearApp()
{
  await caches.delete(APP_CACHE);
}

export async function syncApp(session, base, onProgress, force = false)
{
  const { token, owner, repo } = session;
  const branch = session.branch || 'main';
  const prefix = (session.path || '').replace(/^\/+|\/+$/g, '');
  const r = '/repos/' + encodeURIComponent(owner) + '/' + encodeURIComponent(repo);

  const commit = await gh(r + '/commits/' + encodeURIComponent(branch), token);
  const tree = await gh(r + '/git/trees/' + commit.commit.tree.sha + '?recursive=1', token);
  const start = prefix ? prefix + '/' : '';
  const files = tree.tree
    .filter(e => e.type === 'blob' && e.path.startsWith(start))
    .map(e => ({ path: e.path.slice(start.length), full: e.path, sha: e.sha }))
    .filter(f => !SKIP.some(rx => rx.test(f.path)));
  if (!files.some(f => f.path === 'index.html')) { throw new Error('Keine index.html im privaten Repository gefunden' + (prefix ? ' (Ordner „' + prefix + '“).' : '.')); }

  const cache = await caches.open(APP_CACHE);
  const oldRes = await cache.match(appUrl(base, MANIFEST));
  const old = oldRes ? await oldRes.json() : {};
  const todo = force ? files : files.filter(f => old[f.path] !== f.sha);
  let done = 0;
  onProgress?.(0, todo.length);

  async function load(file)
  {
    const res = await gh(r + '/contents/' + encodePath(file.full) + '?ref=' + commit.sha, token, true);
    let body = await res.arrayBuffer();
    if (/\.html?$/i.test(file.path))
    {
      const text = new TextDecoder().decode(body).replace(/<html\b/i, '<html data-vault="1"');
      body = new TextEncoder().encode(text);
    }
    await cache.put(appUrl(base, file.path), new Response(body, { headers: { 'Content-Type': typeOf(file.path), 'Cache-Control': 'no-cache' } }));
    onProgress?.(++done, todo.length);
  }

  for (let i = 0; i < todo.length; i += PARALLEL) { await Promise.all(todo.slice(i, i + PARALLEL).map(load)); }

  const keep = new Set(files.map(f => f.path));
  for (const path of Object.keys(old)) { if (!keep.has(path)) { await cache.delete(appUrl(base, path)); } }

  const manifest = Object.fromEntries(files.map(f => [f.path, f.sha]));
  await cache.put(appUrl(base, MANIFEST), new Response(JSON.stringify(manifest), { headers: { 'Content-Type': 'application/json' } }));
  return { commit: commit.sha, total: files.length, updated: todo.length };
}
