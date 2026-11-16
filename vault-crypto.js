export const ITERATIONS = 600000;

const enc = new TextEncoder();
const dec = new TextDecoder();

export function toB64(bytes)
{
  let bin = '';
  for (const b of new Uint8Array(bytes)) { bin += String.fromCharCode(b); }
  return btoa(bin);
}

export function fromB64(text)
{
  return Uint8Array.from(atob(text), c => c.charCodeAt(0));
}

export async function userId(name)
{
  const hash = await crypto.subtle.digest('SHA-256', enc.encode(name.trim().toLowerCase()));
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('');
}

async function deriveKey(password, salt, iterations)
{
  const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

export async function encryptEntry(password, payload, iterations = ITERATIONS)
{
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt, iterations);
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(payload)));
  return { iter: iterations, salt: toB64(salt), iv: toB64(iv), data: toB64(data) };
}

export async function decryptEntry(password, entry)
{
  const key = await deriveKey(password, fromB64(entry.salt), entry.iter || ITERATIONS);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(entry.iv) }, key, fromB64(entry.data));
  return JSON.parse(dec.decode(plain));
}
