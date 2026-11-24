const CACHE_NAME = "bigmais-em-casa-v2.2.0";

const ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./global/config.js",
  "./global/estilo.css",
  "./global/painel.js",
  "./global/icon.svg",
  "./global/logo-bigmais.png",
  "./devolucao/index.html",
  "./devolucao/devolucao.js",
  "./estorno/index.html",
  "./estorno/estorno.js"
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.url.includes("script.google.com") || event.request.url.includes("viacep.com.br")) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && event.request.method === "GET") {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(() => caches.match(event.request))
  );
});