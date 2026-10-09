// Minimal offline cache so the app works without a connection after first load.
var CACHE = "tradeoff-v2";
var FILES = ["./", "index.html", "app.js", "sim.js", "manifest.json", "icon.svg", "icon-180.png"];
self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(FILES); }));
  self.skipWaiting();
});
self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }));
});
self.addEventListener("fetch", function (e) {
  e.respondWith(fetch(e.request).catch(function () { return caches.match(e.request); }));
});
