var CACHE_NAME = 'inspeccion-pwa-v4';

var RECURSOS_PRECACHE = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function (cache) {
        return cache.addAll(RECURSOS_PRECACHE);
      })
      .then(function () {
        return self.skipWaiting();
      })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (nombres) {
        return Promise.all(
          nombres.map(function (nombre) {
            if (nombre !== CACHE_NAME) {
              return caches.delete(nombre);
            }
            return Promise.resolve(false);
          })
        );
      })
      .then(function () {
        return self.clients.claim();
      })
  );
});

self.addEventListener('fetch', function (event) {
  var peticion = event.request;

  if (peticion.method !== 'GET') {
    return;
  }

  var url = new URL(peticion.url);

  if (url.origin !== self.location.origin) {
    return;
  }

  event.respondWith(
    caches.match(peticion, { ignoreSearch: true })
      .then(function (respuestaCache) {
        if (respuestaCache) {
          return respuestaCache;
        }

        return fetch(peticion)
          .then(function (respuestaRed) {
            if (respuestaRed && respuestaRed.status === 200 && respuestaRed.type === 'basic') {
              var copia = respuestaRed.clone();
              caches.open(CACHE_NAME).then(function (cache) {
                cache.put(peticion, copia);
              });
            }
            return respuestaRed;
          })
          .catch(function () {
            if (peticion.mode === 'navigate') {
              return caches.match('./index.html');
            }
            return new Response('Recurso no disponible sin conexión.', {
              status: 503,
              statusText: 'Offline',
              headers: { 'Content-Type': 'text/plain; charset=utf-8' }
            });
          });
      })
  );
});
