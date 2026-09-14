/* 서비스워커 — 네트워크 우선.
 *
 * 캐시 우선으로 짜면 새 버전을 올려도 사용자는 옛 화면에 갇힌다. 고치고 배포해도
 * "그대로인데요"라는 말을 듣게 되고, 원인을 설명하기도 어렵다. 그래서 항상 먼저
 * 네트워크에 물어보고, 실패했을 때만 캐시를 내준다. 오프라인 지원은 덤이다.
 *
 * file:// 로 열면 서비스워커는 등록되지 않는다(app.js가 http일 때만 등록한다).
 */

var CACHE = "bible-write-v1";

var APP_SHELL = [
  "./",
  "./index.html",
  "./style.css",
  "./manifest.json",
  "./icon.svg",
  "./js/hangul.js",
  "./js/normalize.js",
  "./js/books.js",
  "./js/store.js",
  "./js/db.js",
  "./js/typing.js",
  "./js/bible.js",
  "./js/manuscript.js",
  "./js/parse.js",
  "./js/source.js",
  "./js/editor.js",
  "./js/app.js"
];

self.addEventListener("install", function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) { return c.addAll(APP_SHELL); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        return k === CACHE ? null : caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (e) {
  var req = e.request;

  // 다른 출처와 GET이 아닌 요청은 손대지 않는다. 가로채 봐야 얻을 게 없고,
  // 잘못 건드리면 원인 찾기 어려운 고장이 된다.
  if (req.method !== "GET") return;
  if (new URL(req.url).origin !== self.location.origin) return;

  e.respondWith(
    fetch(req).then(function (res) {
      if (res && res.status === 200 && res.type === "basic") {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copy); });
      }
      return res;
    }).catch(function () {
      return caches.match(req).then(function (hit) {
        if (hit) return hit;
        // 화면 이동 요청이면 첫 화면이라도 띄운다
        if (req.mode === "navigate") return caches.match("./index.html");
        return new Response("", { status: 504, statusText: "오프라인" });
      });
    })
  );
});
