// Cache the app shell so the page opens with no connection. Data comes from localStorage in app.js.
const C = "holdline-v1", SHELL = ["/", "/index.html", "/app.js", "/app.css", "/tokens.css", "/fonts.css"];
self.addEventListener("install", e => e.waitUntil(caches.open(C).then(c => c.addAll(SHELL))));
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (u.pathname.startsWith("/api/") || e.request.method !== "GET") return;
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request).then(res => { const cp = res.clone(); caches.open(C).then(c => c.put(e.request, cp)); return res; })));
});
