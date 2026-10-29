/* Cache do shell do PWA. Não armazena respostas privadas nem chamadas à API. */
const CACHE_NAME = "hibrido-pwa-v1";
const APP_SHELL = [
  "./",
  "./Coach_Hibrido_IA_SQLite_CORRIGIDO.html",
  "./supabase-config.js",
  "./supabase-auth.js",
  "./manifest.webmanifest",
  "./icon.svg"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith("hibrido-pwa-") && key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  // Nunca guardar respostas do Supabase/API: podem conter dados pessoais.
  if (url.hostname.endsWith(".supabase.co") || url.pathname.includes("/rest/v1/") || url.pathname.includes("/auth/v1/")) return;

  // A biblioteca Supabase pode ficar em cache depois de ser carregada online.
  if (url.hostname === "cdn.jsdelivr.net") {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;
        try {
          const response = await fetch(request);
          if (response.ok) cache.put(request, response.clone());
          return response;
        } catch (error) {
          return new Response("Recurso ainda não disponível offline.", { status: 503, statusText: "Offline" });
        }
      })
    );
    return;
  }

  if (url.origin !== self.location.origin) return;
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok && response.type === "basic") {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      }).catch(() => caches.match("./Coach_Hibrido_IA_SQLite_CORRIGIDO.html"));
    })
  );
});
