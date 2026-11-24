const CACHE_NAME = "bigmais-em-casa-v1.4.0";
const ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./global/estilo.css",
  "./global/painel.js",
  "./global/config.js",
  "./global/icon.svg",
  "./global/logo-bigmais.png",
  "./devolucao/index.html",
  "./devolucao/devolucao.js"
];


self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  // Nunca faz cache das requisições da API do Google Apps Script ou ViaCEP
  if (
    event.request.url.includes("script.google.com") ||
    event.request.url.includes("viacep.com.br")
  ) {
    return;
  }

  // Ignora requisições que não sejam GET
  if (event.request.method !== "GET") {
    return;
  }

  // Busca sempre a versão mais nova na rede (sem cache HTTP) e atualiza o cache offline
  event.respondWith(
    fetch(event.request, { cache: "no-store" })
      .then((response) => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});