// 오프라인 캐시. 파일을 바꾸면 CACHE 버전을 올려 주세요.
const CACHE = 'daily-money-v15';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './js/app.js',
  './js/store.js',
  './js/budget.js',
  './js/suggest.js',
  './js/backup.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  // 브라우저 HTTP 캐시를 거치지 않고 새로 받아서, 옛 파일과 새 파일이 섞이지 않게 함
  event.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(ASSETS.map((url) => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// 네트워크 우선: 온라인이면 항상 최신 파일, 오프라인이면 캐시
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  const isPage = req.mode === 'navigate';
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      try {
        const res = await fetch(isPage ? req.url : req, { cache: 'no-cache' });
        if (res.ok) cache.put(isPage ? './' : req, res.clone());
        return res;
      } catch {
        const cached = await cache.match(isPage ? './' : req, { ignoreSearch: isPage });
        return cached || Response.error();
      }
    })
  );
});
