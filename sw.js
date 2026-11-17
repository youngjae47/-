// 서비스 워커: 홈 화면 앱이 인터넷 없이도 열리게 화면 파일을 보관한다.
// - 인터넷이 되면 항상 새 파일을 받아 쓰고(보관본도 갱신), 안 되면 보관본을 쓴다.
// - 일정 · 목표 데이터(Firestore)는 건드리지 않는다. 데이터의 오프라인 처리는 Firestore가 맡는다.
// 화면 파일 목록을 바꾸면 CACHE 이름의 숫자를 올린다.

const CACHE = "family-schedule-v1";
const APP_FILES = [
  "./",
  "index.html",
  "manifest.webmanifest",
  "css/style.css",
  "js/holidays.js",
  "js/recurrence.js",
  "js/firebase-config.js",
  "js/store.js",
  "js/goals.js",
  "js/celebrate.js",
  "js/app.js",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/apple-touch-icon.png",
  "icons/favicon-64.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(APP_FILES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  const firebaseSdk = url.hostname === "www.gstatic.com" && url.pathname.startsWith("/firebasejs/");
  if (!sameOrigin && !firebaseSdk) return; // Firestore 통신 등은 그대로 둔다

  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok || res.type === "opaque") {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(async () => {
        const hit = await caches.match(req, { ignoreSearch: true });
        if (hit) return hit;
        if (req.mode === "navigate") return caches.match("index.html");
        return Response.error();
      })
  );
});
