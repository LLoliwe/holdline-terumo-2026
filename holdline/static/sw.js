// Cache the app shell so the page opens with no connection. Data comes from localStorage in app.js.
const C = "holdline-v16", SHELL = ["/", "/index.html", "/app.js", "/app.css", "/phone.css", "/chart.js", "/tokens.css", "/fonts.css", "/404.html"];
// skipWaiting after the new shell is fully cached: an old controlled browser must not keep serving the previous app.js from its old cache.
self.addEventListener("install", e => e.waitUntil(caches.open(C).then(c => c.addAll(SHELL.map(u => new Request(u, {cache: "reload"})))).then(() => self.skipWaiting())));
// Drop stale caches, then claim open clients so the next navigation is served by this worker. No page reload is forced: the running tab keeps its in-memory app until the user reloads, and queued decisions live in localStorage, untouched by the worker swap.
self.addEventListener("activate", e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== C).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (u.pathname.startsWith("/api/") || e.request.method !== "GET") return;
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request).then(res => { if (res.ok) { const cp = res.clone(); caches.open(C).then(c => c.put(e.request, cp)); } return res; })));
});
