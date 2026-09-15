(function (global) {
  "use strict";

  // ---------------------------------------------------------------------
  // 본문 파일 — 들여오기와 내보내기
  // ---------------------------------------------------------------------
  // 붙여넣기로 들여온 본문은 브라우저 저장소에 있고, 저장소는 "인터넷 사용 기록
  // 삭제" 한 번에 통째로 사라진다. 그래서 들여온 본문을 data/bible/GEN.js 로
  // 내보낼 수 있게 한다. 그 파일을 폴더에 두면 다음부터는 앱이 알아서 읽는다.
  //
  // 왜 .json이 아니라 .js인가: file:// 로 열면 fetch가 CORS에 막힌다. 반면
  // <script src>는 막히지 않는다. 어차피 빌드 도구가 없으니 스크립트 한 줄이 낫다.
  //
  // 저작권: 이 파일들에는 번역본 본문이 담긴다. 개인적으로 쓰는 건 자유지만
  // 공개 저장소에 올리거나 배포하려면 권리자 허락이 필요하다(.gitignore 참고).

  var SRC = {};

  var REG = global.BIBLE_DATA = global.BIBLE_DATA || {
    index: null,
    books: {},
    put: function (code, data) { REG.books[code] = data; }
  };

  var DIR = "data/bible/";
  var TIMEOUT = 5000;

  function inject(url) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      var done = false;
      var timer = setTimeout(function () {
        if (done) return;
        done = true;
        s.parentNode && s.parentNode.removeChild(s);
        reject(new Error("시간 초과"));
      }, TIMEOUT);
      s.src = url;
      s.onload = function () { if (!done) { done = true; clearTimeout(timer); resolve(true); } };
      s.onerror = function () { if (!done) { done = true; clearTimeout(timer); reject(new Error("파일 없음")); } };
      document.head.appendChild(s);
    });
  }

  /** data/bible/index.js 가 있으면 목록을, 없으면 null. 없는 게 정상이다. */
  SRC.loadIndex = function () {
    if (REG.index) return Promise.resolve(REG.index);
    return inject(DIR + "index.js").then(function () {
      return REG.index || null;
    }, function () {
      return null;
    });
  };

  /** 한 권을 불러온다. 첫 실행에 66권을 다 밀어넣지 않는다 — 필사는 한 번에 한 장이다. */
  SRC.loadBook = function (code) {
    if (REG.books[code]) return Promise.resolve(REG.books[code]);
    return inject(DIR + code + ".js").then(function () {
      return REG.books[code] || null;
    }, function () {
      return null;
    });
  };

  /** 파일에 있는 책을 저장소로 옮긴다. 이미 있으면 건너뛴다. */
  SRC.importBook = function (code, force) {
    if (!force && ST.sources()[code]) return Promise.resolve(0);
    return SRC.loadBook(code).then(function (data) {
      if (!data || !data.c || !data.c.length) return 0;
      return BX.putChapters(code, data.c, data.v || "");
    });
  };

  /**
   * 시작할 때 한 번: 파일로 들어 있는 본문 중 저장소에 없는 걸 채운다.
   *
   * "이미 가져왔나"를 ST.sources()(localStorage)로 판단하면 안 된다.
   * file:// 로 열면 IndexedDB가 막혀 본문이 **메모리에만** 살아 있다가 창을 닫으면
   * 사라지는데, 출처·진도 기록은 localStorage라 그대로 남는다. 그러면 다음에 열 때
   * "이미 있다"고 착각해 파일을 읽지 않고, 본문 없는 앱이 된다.
   * 그래서 기록이 아니라 **실제로 본문이 있는지**를 확인한다.
   */
  SRC.syncFromFiles = function () {
    return SRC.loadIndex().then(function (index) {
      if (!index || !index.length) return 0;
      var n = 0;
      var chain = Promise.resolve();
      index.forEach(function (b) {
        chain = chain.then(function () {
          return BX.getChapter(b.c, 1).then(function (rec) {
            if (rec && rec.verses && rec.verses.length) return null;
            return SRC.importBook(b.c, true).then(function (cnt) { if (cnt) n++; });
          });
        });
      });
      return chain.then(function () { return n; });
    });
  };

  // ------------------------------------------------------------- 인터넷에서 가져오기
  //
  // 붙여넣기는 한 장에 한 번이다. 통독을 하려면 1,189번을 해야 하니 쓸 수 없다.
  // 그래서 공개된 성경 API에서 한 권씩 받아 온다.
  //
  // 앱은 여전히 본문을 담지 않는다 — 받는 주체는 사용자의 브라우저이고, 받은
  // 본문은 그 기기 안에만 있다. 번역본의 권리는 각 권리자에게 있으며, 이 출처들은
  // 한국어 본문의 라이선스를 밝히지 않는다. 개인적으로 읽는 용도로만 쓸 것.
  //
  // 주소를 바꿔 끼울 수 있게 목록으로 둔다. 한 곳이 닫혀도 앱이 멈추지 않는다.

  // 한 책에는 한 번역본만 담긴다(창세기를 영어로 받으면 그 책의 한글 본문은
  // 덮어쓴다). 책마다 다른 번역본을 두는 건 된다 — 시편은 영어, 창세기는 한글처럼.
  function getbible(slug, label, version, lang) {
    return {
      id: "getbible-" + slug,
      label: label,
      version: version,
      lang: lang,
      url: function (nr) { return "https://api.getbible.net/v2/" + slug + "/" + nr + ".json"; },
      parse: parseGetbible
    };
  }

  function parseGetbible(data) {
    var chapters = {};
    (data.chapters || []).forEach(function (ch) {
      var arr = [];
      (ch.verses || []).forEach(function (v) {
        arr[v.verse - 1] = NM.normalizeSource(v.text || "");
      });
      for (var i = 0; i < arr.length; i++) if (arr[i] == null) arr[i] = "";
      chapters[ch.chapter] = arr;
    });
    return chapters;
  }

  SRC.REMOTES = [
    getbible("korean", "개역한글 (한국어)", "개역한글", "ko"),
    // 영어는 저작권이 만료된 판본들이라 출처 문제가 없다.
    getbible("kjv", "King James Version (영어, 1611)", "KJV", "en"),
    getbible("web", "World English Bible (영어, 현대어)", "WEB", "en"),
    getbible("asv", "American Standard Version (영어, 1901)", "ASV", "en"),
    getbible("basicenglish", "Basic English (영어, 쉬운 단어 850개)", "BBE", "en"),
    getbible("ylt", "Young's Literal Translation (영어, 직역)", "YLT", "en")
  ];

  SRC.remote = function (id) {
    for (var i = 0; i < SRC.REMOTES.length; i++) if (SRC.REMOTES[i].id === id) return SRC.REMOTES[i];
    return SRC.REMOTES[0];
  };

  /** 한 권을 받아 저장한다. 이미 있으면 건드리지 않는다(force면 덮어쓴다). */
  SRC.fetchBook = function (code, remoteId, force) {
    var b = BK.byCode(code);
    if (!b) return Promise.reject(new Error("모르는 책입니다: " + code));
    if (!force && ST.sources()[code]) return Promise.resolve(0);

    var r = SRC.remote(remoteId);
    if (!r.parse) return Promise.reject(new Error(r.label + "은 권 단위로 받을 수 없습니다."));

    return fetch(r.url(b.i + 1), { cache: "no-store" }).then(function (res) {
      if (!res.ok) throw new Error("받지 못했습니다 (HTTP " + res.status + ")");
      return res.json();
    }).then(function (data) {
      var chapters = r.parse(data);
      var got = 0;
      for (var k in chapters) if (chapters.hasOwnProperty(k)) got++;
      if (!got) throw new Error("본문이 비어 있습니다.");
      return BX.putChapters(code, chapters, r.version).then(function () { return got; });
    });
  };

  /**
   * 여러 권을 차례로 받는다. 한 권이 실패해도 멈추지 않고 끝까지 간 뒤 알려 준다 —
   * 66권 받다가 40번째에서 끊기면 다시 처음부터 받아야 하는 게 더 나쁘다.
   */
  SRC.fetchBooks = function (codes, remoteId, onProgress, force) {
    var done = 0, failed = [];
    var chain = Promise.resolve();
    codes.forEach(function (code, i) {
      chain = chain.then(function () {
        if (onProgress) onProgress(i, codes.length, BK.byCode(code).k);
        return SRC.fetchBook(code, remoteId, force).then(function (n) {
          if (n) done++;
        }, function (err) {
          failed.push(BK.byCode(code).k + " (" + (err && err.message ? err.message : err) + ")");
        });
      });
    });
    return chain.then(function () { return { done: done, failed: failed }; });
  };

  // ------------------------------------------------------------- 내보내기

  /** 저장소의 한 권을 data/bible/GEN.js 형식의 글로 만든다. */
  SRC.toFileText = function (code) {
    return BX.listChapters(code).then(function (recs) {
      if (!recs.length) return null;
      var version = recs[0].v || "";
      var maxCh = 0;
      recs.forEach(function (r) { if (r.ch > maxCh) maxCh = r.ch; });
      var arr = [];
      for (var i = 0; i < maxCh; i++) arr.push([]);
      recs.forEach(function (r) { arr[r.ch - 1] = r.verses; });

      var lines = [];
      lines.push("// " + BK.byCode(code).k + " — " + (version || "번역본 미기재"));
      lines.push("// bible-write 가 내보낸 본문 파일. data/bible/ 폴더에 두면 앱이 읽는다.");
      lines.push("// 저작권물일 수 있으므로 공개 저장소에 올리지 않는다.");
      lines.push("BIBLE_DATA.put(" + JSON.stringify(code) + ", {");
      lines.push("  v: " + JSON.stringify(version) + ",");
      lines.push("  c: [");
      for (i = 0; i < arr.length; i++) {
        lines.push("    " + JSON.stringify(arr[i]) + (i < arr.length - 1 ? "," : ""));
      }
      lines.push("  ]");
      lines.push("});");
      return lines.join("\n");
    });
  };

  /** 들여온 책 전체의 목록 파일(index.js). */
  SRC.toIndexText = function () {
    var books = BX.importedBooks();
    var src = ST.sources();
    var rows = books.map(function (b) {
      return "  { c: " + JSON.stringify(b.c) + ", n: " + JSON.stringify(b.k) +
        ", ch: " + b.ch + ", v: " + JSON.stringify((src[b.c] && src[b.c].name) || "") + " }";
    });
    return "// bible-write 본문 목록\nBIBLE_DATA.index = [\n" + rows.join(",\n") + "\n];\n";
  };

  SRC.download = function (filename, text, type) {
    var blob = new Blob([text], { type: (type || "text/plain") + ";charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  };

  SRC.DIR = DIR;

  global.SRC = SRC;
})(window);
