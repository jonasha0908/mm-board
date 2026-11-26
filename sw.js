// Service worker: makes the site installable and open fast.
// Files are fetched network-first (revalidated every time) so updates on GitHub show up right away;
// the cached copy is used only when offline. Data requests (Google) are never cached.
const CACHE = "mm-board-v3";
const SHELL = ["./", "./index.html", "./app.css", "./app.js", "./logo.webp", "./ometz.webp", "./hoss.webp", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png", "./apple-touch-icon.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== self.location.origin) return;
  e.respondWith(
    // "no-cache" = always revalidate with GitHub, so a new upload shows up on the next load
    fetch(e.request.url, { cache: "no-cache", credentials: "same-origin" })
      .then((res) => {
        if (!res.ok) return caches.match(e.request).then((r) => r || res);
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request).then((r) => r || caches.match("./index.html")))
  );
});
