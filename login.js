import { userId, decryptEntry } from './vault-crypto.js?v=2';
import { syncApp, hasApp, clearApp, appUrl } from './repo-sync.js?v=2';

const SESSION_KEY = 'vault:session';
const base = new URL('./', location.href).href;
const params = new URLSearchParams(location.search);

const form = document.getElementById('form');
const userInput = document.getElementById('user');
const passInput = document.getElementById('pass');
const remember = document.getElementById('remember');
const button = document.getElementById('submit');
const statusEl = document.getElementById('status');
const bar = document.getElementById('bar');

function status(text, error = false)
{
  statusEl.textContent = text;
  statusEl.classList.toggle('error', error);
}

function progress(done, total)
{
  bar.parentElement.classList.toggle('hidden', !total);
  bar.style.width = (total ? Math.round((done / total) * 100) : 0) + '%';
}

function busy(on)
{
  for (const el of form.elements) { el.disabled = on; }
  button.textContent = on ? 'Bitte warten …' : 'Anmelden';
}

function readSession()
{
  try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || localStorage.getItem(SESSION_KEY) || 'null'); } catch { return null; }
}

function saveSession(session, keep)
{
  try { (keep ? localStorage : sessionStorage).setItem(SESSION_KEY, JSON.stringify(session)); } catch { }
}

function dropSession()
{
  try { localStorage.removeItem(SESSION_KEY); sessionStorage.removeItem(SESSION_KEY); } catch { }
}

function timeout(ms, text)
{
  return new Promise((_, reject) => setTimeout(() => reject(new Error(text)), ms));
}

async function workerReady()
{
  if (!('serviceWorker' in navigator)) { throw new Error('Dieser Browser unterstützt keine Service Worker (privates Fenster?).'); }
  try { await navigator.serviceWorker.register('sw.js'); }
  catch (err) { throw new Error('sw.js konnte nicht geladen werden – liegt sie im Repository „Serien“? (' + err.message + ')'); }
  await Promise.race([navigator.serviceWorker.ready, timeout(15000, 'Service Worker startet nicht. Seite neu laden (Strg + Umschalt + R).')]);
}

async function openApp(session, force)
{
  busy(true);
  status('Lade Dashboard aus dem privaten Repository …');
  try
  {
    await workerReady();
    const result = await Promise.race([syncApp(session, base, progress, force), timeout(120000, 'Zeitüberschreitung beim Laden aus GitHub.')]);
    status(result.updated ? result.updated + ' Dateien geladen – starte …' : 'Dashboard ist aktuell – starte …');
  }
  catch (err)
  {
    const offline = !navigator.onLine || err.name === 'TypeError' || err.name === 'TimeoutError';
    if (offline && await hasApp(base)) { status('Offline – starte gespeicherte Version …'); }
    else
    {
      busy(false);
      progress(0, 0);
      status(err.message || String(err), true);
      if (!offline) { dropSession(); }
      return;
    }
  }
  location.replace(appUrl(base));
}

async function login(e)
{
  e.preventDefault();
  const name = userInput.value.trim();
  const pass = passInput.value;
  if (!name || !pass) { return; }
  busy(true);
  status('Prüfe Anmeldung …');
  try
  {
    const res = await fetch('users.json', { cache: 'no-store', signal: AbortSignal.timeout(15000) });
    if (!res.ok) { throw new Error('users.json nicht gefunden (HTTP ' + res.status + ').'); }
    const users = (await res.json()).users || {};
    const entry = users[await userId(name)];
    if (!entry) { throw new Error('denied'); }
    const payload = await decryptEntry(pass, entry);
    const session = { user: name, token: payload.token, owner: payload.owner, repo: payload.repo, branch: payload.branch || 'main', path: payload.path || '' };
    saveSession(session, remember.checked);
    passInput.value = '';
    await openApp(session, true);
  }
  catch (err)
  {
    busy(false);
    status(err.message === 'denied' || err.name === 'OperationError' ? 'Benutzername oder Passwort falsch.' : err.message, true);
    passInput.select();
  }
}

form.addEventListener('submit', login);

(async () =>
{
  if (params.has('logout'))
  {
    dropSession();
    await clearApp().catch(() => { });
    history.replaceState(null, '', location.pathname);
    status('Du wurdest abgemeldet.');
    return;
  }
  const session = readSession();
  if (session?.token) { await openApp(session, params.has('refresh')); }
  else { userInput.focus(); }
})();
