(function (global) {
  "use strict";

  // ---------------------------------------------------------------------
  // IndexedDB — 본문과 원고가 사는 곳.
  // ---------------------------------------------------------------------
  // 왜 localStorage가 아닌가: 한국어 성경 전문은 수 MB다(브라우저 내부 UTF-16
  // 기준 7~8MB로 추정 — 정확한 수치는 들여온 본문으로 확인이 필요합니다).
  // localStorage 한도는 보통 5MB고, 넘어가면 **던진다**. 하필 그 순간이
  // "방금 쓴 절을 저장하려던 참"이라 최악이다.
  //
  // 레코드는 "장" 단위다. 앱이 읽는 단위가 언제나 장이고, 절 단위로 쪼개면
  // 31,000개가 넘어 한 권 들여오기가 눈에 띄게 느려진다.
  //
  // file:// 로 열면 크롬·엣지는 IndexedDB를 막는다(SecurityError). 그래서
  // available()로 먼저 물어보고, 막혀 있으면 메모리+localStorage로 축소 동작한다.
  // 이 앱은 https(깃허브 페이지 등)로 여는 걸 전제로 한다.

  var DB = {};

  var NAME = "bible-write";
  var VERSION = 1;

  var dbp = null;      // open() Promise 싱글턴
  var okFlag = null;   // available() 결과 캐시
  var fallback = null; // IDB가 막혔을 때 쓰는 대체 저장소

  DB.open = function () {
    if (dbp) return dbp;
    dbp = new Promise(function (resolve, reject) {
      var req;
      try {
        req = indexedDB.open(NAME, VERSION);
      } catch (e) {
        reject(e); return;
      }
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains("verses")) db.createObjectStore("verses", { keyPath: "id" });
        if (!db.objectStoreNames.contains("manuscripts")) {
          var ms = db.createObjectStore("manuscripts", { keyPath: "id" });
          ms.createIndex("by_updated", "updated");
        }
        if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta", { keyPath: "k" });
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
      req.onblocked = function () { reject(new Error("다른 탭에서 이 앱이 열려 있습니다")); };
    });
    return dbp;
  };

  DB.available = function () {
    if (okFlag !== null) return Promise.resolve(okFlag);
    if (typeof indexedDB === "undefined") { okFlag = false; useFallback(); return Promise.resolve(false); }
    return DB.open().then(function () {
      okFlag = true;
      return true;
    }, function () {
      okFlag = false;
      useFallback();
      return false;
    });
  };

  // ------------------------------------------------------------- 축소 저장소
  // 본문은 세션 메모리에만 둔다(탭을 닫으면 사라지지만 그 세션은 정상 동작한다).
  // 원고는 날아가면 안 되므로 localStorage에 장 단위로 적는다.

  function useFallback() {
    if (fallback) return;
    var mem = { verses: {}, manuscripts: {}, meta: {} };
    fallback = {
      get: function (store, key) {
        if (store === "manuscripts") {
          try {
            var raw = localStorage.getItem("bw.ms." + key);
            if (raw) return Promise.resolve(JSON.parse(raw));
          } catch (e) { /* 아래 메모리로 */ }
        }
        return Promise.resolve(mem[store][key] || null);
      },
      put: function (store, value) {
        mem[store][value.id || value.k] = value;
        if (store === "manuscripts") {
          try { localStorage.setItem("bw.ms." + value.id, JSON.stringify(value)); } catch (e) { /* 조용히 */ }
        }
        return Promise.resolve();
      },
      del: function (store, key) {
        delete mem[store][key];
        if (store === "manuscripts") {
          try { localStorage.removeItem("bw.ms." + key); } catch (e) { /* 조용히 */ }
        }
        return Promise.resolve();
      },
      all: function (store, lo, hi) {
        var out = [], id;
        if (store === "manuscripts") {
          try {
            for (var i = 0; i < localStorage.length; i++) {
              var k = localStorage.key(i);
              if (k && k.indexOf("bw.ms.") === 0) mem.manuscripts[k.slice(6)] = JSON.parse(localStorage.getItem(k));
            }
          } catch (e) { /* 조용히 */ }
        }
        for (id in mem[store]) if (mem[store].hasOwnProperty(id)) {
          if (lo != null && id < lo) continue;
          if (hi != null && id > hi) continue;
          out.push(mem[store][id]);
        }
        out.sort(function (a, b) { return (a.id || a.k) < (b.id || b.k) ? -1 : 1; });
        return Promise.resolve(out);
      }
    };
  }

  function backend() {
    return DB.available().then(function (ok) { return ok ? null : fallback; });
  }

  // ------------------------------------------------------------- 기본 조작

  DB.get = function (store, key) {
    return backend().then(function (fb) {
      if (fb) return fb.get(store, key);
      return DB.open().then(function (db) {
        return new Promise(function (resolve, reject) {
          var r = db.transaction(store, "readonly").objectStore(store).get(key);
          r.onsuccess = function () { resolve(r.result || null); };
          r.onerror = function () { reject(r.error); };
        });
      });
    });
  };

  DB.put = function (store, value) {
    return backend().then(function (fb) {
      if (fb) return fb.put(store, value);
      return DB.open().then(function (db) {
        return new Promise(function (resolve, reject) {
          var tx = db.transaction(store, "readwrite");
          tx.objectStore(store).put(value);
          tx.oncomplete = function () { resolve(); };
          tx.onerror = function () { reject(tx.error); };
          tx.onabort = function () { reject(tx.error); };
        });
      });
    });
  };

  /** 여러 건을 한 트랜잭션으로. 한 권(수십 장)을 들여올 때 쓴다. */
  DB.putAll = function (store, values) {
    if (!values || !values.length) return Promise.resolve();
    return backend().then(function (fb) {
      if (fb) {
        var chain = Promise.resolve();
        values.forEach(function (v) { chain = chain.then(function () { return fb.put(store, v); }); });
        return chain;
      }
      return DB.open().then(function (db) {
        return new Promise(function (resolve, reject) {
          var tx = db.transaction(store, "readwrite");
          var os = tx.objectStore(store);
          for (var i = 0; i < values.length; i++) os.put(values[i]);
          tx.oncomplete = function () { resolve(); };
          tx.onerror = function () { reject(tx.error); };
          tx.onabort = function () { reject(tx.error); };
        });
      });
    });
  };

  DB.del = function (store, key) {
    return backend().then(function (fb) {
      if (fb) return fb.del(store, key);
      return DB.open().then(function (db) {
        return new Promise(function (resolve, reject) {
          var tx = db.transaction(store, "readwrite");
          tx.objectStore(store)["delete"](key);
          tx.oncomplete = function () { resolve(); };
          tx.onerror = function () { reject(tx.error); };
        });
      });
    });
  };

  /** 키 범위 스캔. 키가 "GEN.001"이라 사전순이 곧 장 순서다. */
  DB.range = function (store, lo, hi) {
    return backend().then(function (fb) {
      if (fb) return fb.all(store, lo, hi);
      return DB.open().then(function (db) {
        return new Promise(function (resolve, reject) {
          var out = [];
          var kr = lo != null && hi != null ? IDBKeyRange.bound(lo, hi) : null;
          var r = db.transaction(store, "readonly").objectStore(store).openCursor(kr);
          r.onsuccess = function () {
            var cur = r.result;
            if (!cur) { resolve(out); return; }
            out.push(cur.value);
            cur["continue"]();
          };
          r.onerror = function () { reject(r.error); };
        });
      });
    });
  };

  DB.estimate = function () {
    if (navigator.storage && navigator.storage.estimate) {
      return navigator.storage.estimate().then(null, function () { return null; });
    }
    return Promise.resolve(null);
  };

  // 같은 키에 대한 읽고-고쳐-쓰기가 겹치지 않게 줄을 세운다.
  // 절을 빠르게 연달아 끝내면 이게 없으면 반드시 덮어쓰기가 난다.
  var queues = {};
  DB.enqueue = function (key, fn) {
    var prev = queues[key] || Promise.resolve();
    var next = prev.then(fn, fn);
    queues[key] = next.then(null, function () { /* 체인이 끊기지 않게 */ });
    return next;
  };

  DB.NAME = NAME;

  global.DB = DB;
})(window);
