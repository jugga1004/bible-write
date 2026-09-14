(function (global) {
  "use strict";

  // ---------------------------------------------------------------------
  // 본문 저장·조회
  // ---------------------------------------------------------------------
  // 레코드 하나 = 한 장.
  //   { id: "GEN.001", book: "GEN", ch: 1, verses: ["태초에…", …], v: "개역한글", ts }
  // 절 번호는 배열 인덱스+1이다. 번호를 따로 들고 있지 않은 이유는, 성경 본문이
  // 1절부터 빠짐없이 이어지기 때문이다(빠진 절은 들여올 때 빈 문자열로 채운다).
  //
  // 저작권 안내: 여기 담기는 건 번역본 본문이다. 개인적으로 쓰는 건 자유지만
  // 저장소에 커밋하거나 남에게 배포하려면 권리자 허락이 필요하다. 그래서
  // data/bible/ 폴더는 .gitignore에 들어 있다.

  var BX = {};

  BX.getChapter = function (code, ch) {
    return DB.get("verses", BK.chapterKey(code, ch));
  };

  BX.getVerse = function (code, ch, v) {
    return BX.getChapter(code, ch).then(function (rec) {
      if (!rec || !rec.verses) return null;
      return rec.verses[v - 1] || null;
    });
  };

  /**
   * 한 장을 저장한다. 진도표의 "전체 절 수"도 여기서 함께 갱신한다 —
   * 본문이 들어오는 순간이 절 수를 아는 유일한 시점이다.
   */
  BX.putChapter = function (code, ch, verses, versionName) {
    var rec = {
      id: BK.chapterKey(code, ch),
      book: code, ch: ch,
      verses: verses,
      v: versionName || "",
      ts: Date.now()
    };
    return DB.put("verses", rec).then(function () {
      ST.setChapter(code, ch, null, verses.length);
      return rec;
    });
  };

  /**
   * 여러 장을 한 트랜잭션으로. chapters는 { 장번호: [절, …] } 또는
   * 1장부터 빠짐없이 이어지는 배열의 배열.
   */
  BX.putChapters = function (code, chapters, versionName) {
    var recs = [], nums = [];
    var ts = Date.now();
    var n;
    if (Object.prototype.toString.call(chapters) === "[object Array]") {
      for (n = 0; n < chapters.length; n++) if (chapters[n]) nums.push(n + 1);
    } else {
      for (var k in chapters) if (chapters.hasOwnProperty(k)) nums.push(parseInt(k, 10));
      nums.sort(function (a, b) { return a - b; });
    }
    nums.forEach(function (num) {
      var verses = Object.prototype.toString.call(chapters) === "[object Array]"
        ? chapters[num - 1] : chapters[num];
      if (!verses || !verses.length) return;
      recs.push({ id: BK.chapterKey(code, num), book: code, ch: num, verses: verses, v: versionName || "", ts: ts });
    });
    return DB.putAll("verses", recs).then(function () {
      recs.forEach(function (r) { ST.setChapter(code, r.ch, null, r.verses.length); });
      var src = ST.sources()[code] || {};
      ST.setSource(code, {
        name: versionName || src.name || "",
        at: ts,
        chapters: countChapters(code)
      });
      return recs.length;
    });
  };

  function countChapters(code) {
    var p = ST.bookProgress(code), n = 0;
    for (var i = 0; i < p.t.length; i++) if (p.t[i]) n++;
    return n;
  }

  BX.listChapters = function (code) {
    return DB.range("verses", code + ".000", code + ".999");
  };

  BX.hasChapter = function (code, ch) {
    var p = ST.bookProgress(code);
    return !!p.t[ch - 1];
  };

  BX.deleteBook = function (code) {
    return BX.listChapters(code).then(function (recs) {
      var chain = Promise.resolve();
      recs.forEach(function (r) { chain = chain.then(function () { return DB.del("verses", r.id); }); });
      return chain;
    }).then(function () {
      var all = ST.progress();
      if (all[code]) { delete all[code]; ST.replaceProgress(all); }
      ST.removeSource(code);
    });
  };

  /** 들여온 본문이 있는 책 코드 목록 (정경 순서) */
  BX.importedBooks = function () {
    var src = ST.sources(), out = [];
    for (var i = 0; i < BK.BOOKS.length; i++) {
      if (src[BK.BOOKS[i].c]) out.push(BK.BOOKS[i]);
    }
    return out;
  };

  global.BX = BX;
})(window);
