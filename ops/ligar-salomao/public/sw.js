// Service worker do "Ligar pro Salomão": guarda só o casco da página. NUNCA guarda /ligar/api/* (token, estado, recados).
const V = "ligar-v2"; // v2: confirmação com token do servidor (P1 LIVRE)
const CASCO = ["/ligar/", "/ligar/estilo.css", "/ligar/app.js", "/ligar/mic-worklet.js", "/ligar/icone.svg", "/ligar/manifest.webmanifest"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(V).then((c) => c.addAll(CASCO)).then(() => self.skipWaiting())); });
self.addEventListener("activate", (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith("ligar-") && k !== V).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin || !u.pathname.startsWith("/ligar/") || u.pathname.startsWith("/ligar/api/")) return;
  // rede primeiro (o login do Access pode expirar e precisa redirecionar); cache só se estiver sem rede
  e.respondWith(fetch(e.request).then((r) => { if (r.ok && r.type === "basic") { const c = r.clone(); caches.open(V).then((k) => k.put(e.request, c)); } return r; })
    .catch(() => caches.match(e.request).then((r) => r || Response.error())));
});
