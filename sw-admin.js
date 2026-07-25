/* ESCENA Admin — minimal app-shell service worker.
   Caches ONLY the static logo images for fast/offline icon loads.
   admin.html itself is intentionally NEVER cached or served from Cache
   Storage: it's the actual app code, changed frequently, and a service
   worker sits in front of the network layer — independent of the site's
   HTTP Cache-Control headers. Caching it (even with a "network first, fall
   back to cache on failure" strategy) meant that on a flaky connection
   (exactly the case on mobile data while uploading a photo), a single
   failed fetch would silently serve back whatever old copy of admin.html
   had been cached — possibly from days/weeks earlier, with different or
   already-fixed bugs — with no visible indication anything was stale. That
   made behavior inconsistent across devices for no reason a user could see.
   Never caches products-data.js or api.github.com calls either — those
   must always be live. */
var CACHE = "escena-admin-shell-v2";
var SHELL = ["assets/img/escena-logo.jpg", "assets/img/escena-logo.svg"];

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
  if (e.request.mode === "navigate") return; // admin.html itself: always network, never cached
  if (url.indexOf("api.github.com") > -1) return; // never intercept the GitHub API
  if (url.indexOf(".js") > -1) return; // any script (products-data.js, sales-log.js, this app's own JS) — always live
  if (url.indexOf(".html") > -1) return; // belt-and-suspenders alongside the navigate check above

  e.respondWith(
    fetch(e.request).then(function (res) {
      var copy = res.clone();
      caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
      return res;
    }).catch(function () { return caches.match(e.request); })
  );
});
