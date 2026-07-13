/* ESCENA Admin — minimal app-shell service worker.
   Only caches the shell for fast repeat loads / installability.
   Never caches products-data.js or api.github.com calls — those must always be live. */
var CACHE = "escena-admin-shell-v1";
var SHELL = ["admin.html", "assets/img/escena-logo.jpg", "assets/img/escena-logo.svg"];

self.addEventListener("install", function (e) {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(SHELL); }));
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (e) {
  var url = e.request.url;
  if (e.request.method !== "GET") return;
  if (url.indexOf("api.github.com") > -1) return; // never intercept the GitHub API
  if (url.indexOf("products-data.js") > -1) return; // always must be fresh

  e.respondWith(
    fetch(e.request).then(function (res) {
      var copy = res.clone();
      caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
      return res;
    }).catch(function () { return caches.match(e.request); })
  );
});
