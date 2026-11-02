// public/sw.js
// app shell caching so fokus opens offline, plus cached api reads for roadmaps
// the user chose to keep. saved copies also live in localStorage (see offline.ts).

const VERSION = "fokus-v2";
const SHELL = ["index.html", "manifest.webmanifest", "icon-192.png", "icon-512.png"];

// the built asset names are hashed, so read them out of index.html at install time
const precache = async () => {
  const base = new URL("./", self.registration.scope);
  const cache = await caches.open(VERSION);
  await cache.addAll(SHELL.map((p) => new URL(p, base).href)).catch(() => {});
  try {
    const html = await (await fetch(new URL("index.html", base))).text();
    const assets = [...new Set(
      [...html.matchAll(/(?:src|href)="([^"]*\/assets\/[^"]+)"/g)].map((m) => m[1])
    )];
    await Promise.all(
      assets.map((a) => cache.add(new URL(a, base).href).catch(() => {}))
    );
  } catch {
    // offline at install time: the runtime cache will fill in later
  }
};

self.addEventListener("install", (event) => {
  event.waitUntil(precache().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

const isApiRoadmap = (url) =>
  url.pathname.endsWith("/api/roadmaps") || /\/api\/roadmaps\/\d+$/.test(url.pathname);

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // navigations: network first, cached shell when offline
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit || caches.match("index.html")))
    );
    return;
  }

  // roadmap reads: network first, fall back to the last cached copy
  if (isApiRoadmap(url)) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // built assets and images: cache first
  if (url.pathname.includes("/assets/") || /\.(png|svg|css|js|woff2?)$/.test(url.pathname)) {
    event.respondWith(
      caches.match(req).then((hit) =>
        hit ||
        fetch(req).then((res) => {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(req, copy)).catch(() => {});
          return res;
        })
      )
    );
  }
});
