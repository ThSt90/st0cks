// st0cks Service-Worker: erst Netz, bei Ausfall der zuletzt gespeicherte Stand (Offline-Betrieb). Keine Depotdaten im Spiel.
const CACHE = "st0cks-lean-v3";
self.addEventListener("install", e => { self.skipWaiting(); e.waitUntil(caches.open(CACHE).then(c => c.addAll(["./", "index.html", "kpi.js", "charts.js", "icon.png", "favicon.png", "manifest.webmanifest"]).catch(() => {}))); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", e => {
  const r = e.request; if (r.method !== "GET" || new URL(r.url).origin !== location.origin) return;
  e.respondWith(fetch(r).then(res => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(r, copy)); } return res; })
    .catch(() => caches.match(r, { ignoreSearch: true }).then(m => { if (!m) return caches.match("index.html");
      const h = new Headers(m.headers); h.set("x-from-cache", "1"); return new Response(m.body, { status: m.status, statusText: m.statusText, headers: h }); })));
});
