const CACHE_NAME = "portal-bigmais-v3.0.2";
const ARQUIVOS_CACHE = [
  "./",
  "./index.html",
  "./home.html",
  "./manifest.json",
  "./global/estilo.css?v=3.0.2",
  "./global/config.js?v=3.0.2",
  "./global/auth.js?v=3.0.2",
  "./global/painel.js?v=3.0.2",
  "./global/icon.svg",
  "./global/logo-bigmais.png",
  "./solicitacoes/index.html",
  "./solicitacoes/devolucao/index.html",
  "./solicitacoes/devolucao/devolucao.js?v=3.0.2",
  "./solicitacoes/estorno/index.html",
  "./solicitacoes/estorno/estorno.js?v=3.0.2",
  "./entregas/index.html",
  "./entregas/entregas.js?v=3.0.2",
  "./entregas/motorista.html",
  "./entregas/motorista.js?v=3.0.2",
  "./entregas/manifest.json",
  "./entregas/sw.js",
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.allSettled(
        ARQUIVOS_CACHE.map((url) =>
          cache.add(url).catch((err) => {
            console.warn("Falha ao cachear arquivo:", url, err);
          })
        )
      )
    )
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