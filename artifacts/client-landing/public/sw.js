/* Optimatren — service worker (client portal).
 * - static files (build assets, fonts, icons): cache first, filled while browsing;
 * - page navigation: network first, falling back to the cached app shell when offline;
 * - /api/*: never cached here — the training screens keep their own copy of today's plan
 *   and a queue of unsent results (src/lib/training).
 * Bump VERSION to drop old caches. */
const VERSION = "v1";
const CACHE = `optimatren-${VERSION}`;
const SCOPE = self.registration.scope; // e.g. https://host/client-landing/

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.add(new Request(SCOPE, { cache: "reload" }))).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith("optimatren-") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.pathname.startsWith("/api/")) return;

  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => { if (res.ok && url.href.startsWith(SCOPE)) caches.open(CACHE).then((c) => c.put(SCOPE, res.clone())); return res; })
        .catch(() => caches.match(SCOPE).then((r) => r || Response.error())),
    );
    return;
  }

  const sameOriginAsset = url.origin === self.location.origin && url.pathname.startsWith(new URL(SCOPE).pathname);
  const font = /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);
  if (sameOriginAsset || font) {
    event.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok || res.type === "opaque") { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
        return res;
      })),
    );
  }
});
