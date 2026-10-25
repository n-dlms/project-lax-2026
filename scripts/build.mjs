import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const root = new URL('../', import.meta.url);
const out = new URL('../dist/', import.meta.url);
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });

for (const file of ['index.html', '_headers', 'freshness.js', 'app.js', 'backup.js', 'workspace.js', 'engine.js', 'coach.js', 'icons.js', 'experience.js', 'style.css', 'manifest.webmanifest']) {
  await cp(new URL(file, root), new URL(file, out));
}
await cp(new URL('fonts/', root), new URL('fonts/', out), { recursive: true });
await cp(new URL('assets/', root), new URL('assets/', out), { recursive: true });

const list = async (directory, prefix = '') => {
  const entries = await readdir(new URL(directory, out), { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = `${prefix}${entry.name}`;
    if (entry.isDirectory()) files.push(...await list(`${directory}${entry.name}/`, `${path}/`));
    else if (!path.endsWith('.md') && !path.endsWith('.txt') && !path.endsWith('LICENSE')) files.push(`/${directory}${entry.name}`);
  }
  return files;
};
const precache = ['/', '/index.html', '/freshness.js', '/app.js', '/backup.js', '/workspace.js', '/engine.js', '/coach.js', '/icons.js', '/experience.js', '/style.css', '/manifest.webmanifest',
  ...await list('fonts/'), ...await list('assets/')];
const hash = createHash('sha256');
for (const path of precache.filter(path => path !== '/')) hash.update(await readFile(new URL(`.${path}`, out)));
const cacheName = `project-lax-${hash.digest('hex').slice(0, 12)}`;
const serviceWorker = `const CACHE = ${JSON.stringify(cacheName)};\nconst PRECACHE = ${JSON.stringify(precache)};\nconst KNOWN = new Set(PRECACHE);\nconst FRESH = new Set(['/freshness.js', '/app.js', '/backup.js', '/workspace.js', '/engine.js', '/coach.js', '/icons.js', '/experience.js', '/style.css']);\nself.addEventListener('install', event => { event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(PRECACHE)).then(() => self.skipWaiting())); });\nself.addEventListener('activate', event => { event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('project-lax-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())); });\nself.addEventListener('fetch', event => { const request = event.request; if (request.method !== 'GET') return; const url = new URL(request.url); if (url.origin !== self.location.origin) return; if (request.mode === 'navigate') { event.respondWith(fetch(request).catch(() => caches.match('/index.html'))); return; } if (!KNOWN.has(url.pathname)) return; if (FRESH.has(url.pathname)) { event.respondWith(fetch(request).then(response => { if (response.ok) { const copy = response.clone(); event.waitUntil(caches.open(CACHE).then(cache => cache.put(request, copy))); } return response; }).catch(() => caches.match(request))); return; } event.respondWith(caches.match(request).then(hit => hit || fetch(request))); });\n`;
await writeFile(new URL('service-worker.js', out), serviceWorker);
