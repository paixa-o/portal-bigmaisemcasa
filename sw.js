const CACHE_NAME = "portal-bigmais-v3.0.0";
const ARQUIVOS_CACHE = [
  "./",
  "./index.html",
  "./home.html",
  "./manifest.json",
  "./global/estilo.css",
  "./global/config.js",
  "./global/auth.js",
  "./global/icon.svg",
  "./global/logo-bigmais.png",
  "./solicitacoes/index.html",
  "./solicitacoes/painel.js",
  "./solicitacoes/devolucao/index.html",
  "./solicitacoes/devolucao/devolucao.js",
  "./solicitacoes/estorno/index.html",
  "./solicitacoes/estorno/estorno.js",
  "./entregas/index.html",
  "./entregas/entregas.js",
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ARQUIVOS_CACHE))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((nomes) =>
        Promise.all(
          nomes
            .filter((nome) => nome !== CACHE_NAME)
            .map((nome) => caches.delete(nome))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (
    event.request.method !== "GET" ||
    url.origin !== self.location.origin
  ) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((resposta) => {
        const copia = resposta.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copia));
        return resposta;
      })
      .catch(() => caches.match(event.request))
  );
});