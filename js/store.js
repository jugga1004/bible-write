(function (global) {
  "use strict";

  // ---------------------------------------------------------------------
  // localStorage — 작고 "지금 당장" 필요한 것만.
  // ---------------------------------------------------------------------
  // 본문과 원고는 용량 때문에 IndexedDB(db.js)로 가고, 여기엔 앱을 열자마자
  // 첫 화면을 그리는 데 필요한 것만 둔다. 진도표를 IDB에서 읽으면 비동기라
  // 한 프레임 빈 화면이 뜨고, 그게 매번 눈에 띈다.
  //
  // 시크릿 모드·사이트 데이터 차단에서는 localStorage 접근 자체가 throw 한다.
  // 그때 그냥 실패하면 사용자는 "왜 진도가 안 남지"를 영영 모른다. 그래서
  // 메모리에 같은 내용을 들고 가고(이번 세션은 정상 동작) persistent()로
  // 화면에 "이 브라우저에는 저장되지 않습니다"를 띄운다.

  var ST = {};

  var K = {
    settings: "bw.settings",
    progress: "bw.progress",
    sources: "bw.sources",
    position: "bw.position",
    draft: "bw.draft",
    stats: "bw.stats"
  };

  var memory = {};
  var canPersist = null;

  ST.persistent = function () {
    if (canPersist !== null) return canPersist;
    try {
      localStorage.setItem("bw.__probe", "1");
      localStorage.removeItem("bw.__probe");
      canPersist = true;
    } catch (e) {
      canPersist = false;
    }
    return canPersist;
  };

  function read(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      if (raw) return JSON.parse(raw);
    } catch (e) { /* 메모리 폴백으로 */ }
    return memory[key] !== undefined ? memory[key] : fallback;
  }

  function write(key, value) {
    memory[key] = value;
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      return false; // 용량 초과 등 — 조용히 실패하고 메모리로 버틴다
    }
  }

  // ------------------------------------------------------------- 설정

  var DEFAULTS = {
    version: "",        // 본문 번역본 이름 (사용자가 들여오며 적는다)
    fontSize: 18,
    autoNext: true,     // 절을 다 쓰면 저절로 다음 절로
    showRomaja: false,
    sound: false
  };

  ST.settings = function () {
    var s = read(K.settings, {}) || {};
    var out = {};
    for (var k in DEFAULTS) if (DEFAULTS.hasOwnProperty(k)) {
      out[k] = s[k] === undefined ? DEFAULTS[k] : s[k];
    }
    return out;
  };

  ST.saveSettings = function (patch) {
    var s = ST.settings();
    for (var k in patch) if (patch.hasOwnProperty(k)) s[k] = patch[k];
    write(K.settings, s);
    return s;
  };

  // ------------------------------------------------------------- 진도
  // { "GEN": { c: [31, 25, 0, ...], t: [31, 25, 24, ...] } }
  //   c = 장별 '쓴 절 수', t = 장별 '전체 절 수'(본문을 들여올 때 채워진다)
  //
  // 장마다 {done, total, ts} 객체를 매달면 1,189개라 50KB에 가까워진다.
  // 숫자 배열이면 5KB 안쪽이고, 진도표·스트릭·이어쓰기를 전부 이걸로 그린다.

  ST.progress = function () { return read(K.progress, {}) || {}; };

  ST.bookProgress = function (code) {
    var p = ST.progress()[code];
    return p || { c: [], t: [] };
  };

  ST.setChapter = function (code, ch, doneCount, totalCount) {
    var all = ST.progress();
    var b = all[code] || { c: [], t: [] };
    var i = ch - 1;
    while (b.c.length <= i) b.c.push(0);
    while (b.t.length <= i) b.t.push(0);
    if (doneCount != null) b.c[i] = doneCount;
    if (totalCount != null) b.t[i] = totalCount;
    all[code] = b;
    write(K.progress, all);
  };

  ST.replaceProgress = function (obj) { write(K.progress, obj || {}); };

  /** 전체 진행률 — 본문이 있는 장만 분모로 센다(없는 장은 아직 쓸 수 없으니). */
  ST.overall = function () {
    var all = ST.progress(), done = 0, total = 0, chaptersDone = 0, chaptersHave = 0;
    for (var code in all) if (all.hasOwnProperty(code)) {
      var b = all[code];
      for (var i = 0; i < b.t.length; i++) {
        if (!b.t[i]) continue;
        chaptersHave++;
        total += b.t[i];
        done += Math.min(b.c[i] || 0, b.t[i]);
        if ((b.c[i] || 0) >= b.t[i]) chaptersDone++;
      }
    }
    return { verses: done, verseTotal: total, chapters: chaptersDone, chapterTotal: chaptersHave };
  };

  // ------------------------------------------------------------- 본문 출처
  // { "GEN": { name: "개역한글", at: 1757..., chapters: 50 } }

  ST.sources = function () { return read(K.sources, {}) || {}; };
  ST.setSource = function (code, info) {
    var s = ST.sources();
    s[code] = info;
    write(K.sources, s);
  };
  ST.removeSource = function (code) {
    var s = ST.sources();
    delete s[code];
    write(K.sources, s);
  };

  // ------------------------------------------------------------- 위치·초안

  ST.position = function () { return read(K.position, null); };
  ST.setPosition = function (book, ch, v) { write(K.position, { book: book, ch: ch, v: v }); };

  // 쓰던 절 하나. 탭을 닫는 순간 IDB 비동기 쓰기는 끝난다는 보장이 없어서
  // 여기에만 동기로 적어 둔다. 절을 다 쓰면 IDB로 옮겨 간다.
  ST.draft = function () { return read(K.draft, null); };
  ST.setDraft = function (book, ch, v, text) {
    write(K.draft, { book: book, ch: ch, v: v, text: text, ts: Date.now() });
  };
  ST.clearDraft = function () { write(K.draft, null); };

  // ------------------------------------------------------------- 날짜별 기록

  ST.today = function () {
    var d = new Date();
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  };
  function pad(n) { return n < 10 ? "0" + n : String(n); }

  ST.stats = function () { return read(K.stats, { days: {} }) || { days: {} }; };

  ST.addRecord = function (jamo, ms, verses) {
    var s = ST.stats();
    var key = ST.today();
    var d = s.days[key] || { jamo: 0, ms: 0, verses: 0 };
    d.jamo += jamo || 0;
    d.ms += ms || 0;
    d.verses += verses || 0;
    s.days[key] = d;
    prune(s);
    write(K.stats, s);
    return d;
  };

  // 400일이 넘으면 오래된 날짜부터 버린다. 스트릭·최근 기록만 쓰므로 충분하다.
  function prune(s) {
    var keys = [];
    for (var k in s.days) if (s.days.hasOwnProperty(k)) keys.push(k);
    if (keys.length <= 400) return;
    keys.sort();
    for (var i = 0; i < keys.length - 400; i++) delete s.days[keys[i]];
  }

  /** 오늘(또는 어제)까지 이어진 연속 일수. 오늘 아직 안 썼어도 어제까지면 살아 있다. */
  ST.streak = function () {
    var days = ST.stats().days || {};
    var d = new Date();
    var n = 0;
    if (!days[ST.today()]) d.setDate(d.getDate() - 1); // 오늘은 아직 안 쓴 것일 수 있다
    for (;;) {
      var key = d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
      if (!days[key] || !days[key].verses) break;
      n++;
      d.setDate(d.getDate() - 1);
    }
    return n;
  };

  ST.todayRecord = function () {
    return ST.stats().days[ST.today()] || { jamo: 0, ms: 0, verses: 0 };
  };

  // ------------------------------------------------------------- 백업

  ST.dump = function () {
    return {
      settings: ST.settings(), progress: ST.progress(), sources: ST.sources(),
      position: ST.position(), stats: ST.stats()
    };
  };

  ST.restore = function (obj) {
    if (!obj) return false;
    if (obj.settings) write(K.settings, obj.settings);
    if (obj.progress) write(K.progress, obj.progress);
    if (obj.sources) write(K.sources, obj.sources);
    if (obj.position) write(K.position, obj.position);
    if (obj.stats) write(K.stats, obj.stats);
    return true;
  };

  ST.K = K;

  global.ST = ST;
})(window);
