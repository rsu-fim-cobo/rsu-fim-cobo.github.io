/* RSU COBO — service worker: fa funzionare l'app anche senza rete.
   Strategia: si prova sempre prima la rete (così si vede subito l'ultima versione pubblicata);
   la copia salvata sul telefono si usa solo quando la rete non c'è.
   Se aggiungete file all'app, elencateli qui sotto e aumentate il numero di VERSIONE. */
const VERSIONE = "rsu-v20";

// File indispensabili: senza questi l'app non parte offline.
const FILE_APP = [
  "./",
  "index.html",
  "stile.css",
  "app.js",
  "lib/qrcode.js",
  "manifest.webmanifest"
];
// File utili ma non indispensabili: se uno manca, l'installazione prosegue lo stesso.
const FILE_EXTRA = [
  "icone/favicon.png",
  "icone/apple-touch-icon.png",
  "icone/icona-192.png",
  "icone/icona-512.png",
  "fonts/archivo-narrow-latin-600-normal.woff2",
  "fonts/archivo-narrow-latin-700-normal.woff2",
  "fonts/ibm-plex-sans-latin-400-normal.woff2",
  "fonts/ibm-plex-sans-latin-400-italic.woff2",
  "fonts/ibm-plex-sans-latin-500-normal.woff2",
  "fonts/ibm-plex-sans-latin-600-normal.woff2",
  "dati/aggiornamenti.md",
  "dati/proposte.md",
  "dati/convenzioni.md",
  "dati/segnalazioni.md",
  "dati/contatti.md"
];

// "reload" scavalca la cache del browser: si scarica davvero la versione pubblicata.
const fresh = url => fetch(new Request(url, { cache: "reload" }));

self.addEventListener("install", e => {
  e.waitUntil((async () => {
    const c = await caches.open(VERSIONE);
    await Promise.all(FILE_APP.map(async u => { const r = await fresh(u); if (r.ok) await c.put(u, r); }));
    await Promise.allSettled(FILE_EXTRA.map(async u => { const r = await fresh(u); if (r.ok) await c.put(u, r); }));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== VERSIONE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  // Caratteri e icone non cambiano: prima la copia salvata (più veloce).
  if (/\/(fonts|icone)\//.test(url.pathname)) {
    e.respondWith(caches.match(req, { ignoreSearch: true }).then(c => c || fetch(req)));
    return;
  }

  // Tutto il resto (pagina, codice, contenuti): prima la rete, poi la copia salvata.
  e.respondWith((async () => {
    try {
      const res = await fetch(req, { cache: "no-cache" });
      if (res.ok) {
        const copy = res.clone();
        caches.open(VERSIONE).then(c => c.put(req.mode === "navigate" ? "index.html" : req, copy));
      }
      return res;
    } catch (_) {
      const cached = await caches.match(req, { ignoreSearch: true });
      if (cached) return cached;
      if (req.mode === "navigate") return caches.match("index.html");
      return Response.error();
    }
  })());
});
