(function (global) {
  "use strict";

  // ---------------------------------------------------------------------
  // 원고 — 사용자가 실제로 친 글.
  // ---------------------------------------------------------------------
  // 레코드 하나 = 한 장.
  //   { id:"GEN.001", book, ch, verses:{ "1":"…", "3":"…" }, updated, doneCount, jamo, ms }
  //
  // verses를 배열이 아니라 **번호를 키로 하는 성긴 객체**로 둔다. 아직 안 쓴 절은
  // 키가 아예 없어서, 몇 절을 썼는지가 키 개수로 바로 나온다.
  //
  // IndexedDB가 진짜 기록이고 localStorage의 진도표(bw.progress)는 그걸 베낀
  // 캐시다. 어긋난 것 같으면 recomputeProgress()로 다시 만든다.

  var MS = {};

  MS.getChapter = function (code, ch) {
    return DB.get("manuscripts", BK.chapterKey(code, ch));
  };

  /**
   * 절 하나를 확정 저장한다.
   * 읽고-고쳐-쓰기라 같은 장에 대한 저장은 줄을 세운다. 절을 빠르게 연달아
   * 끝내면 이게 없을 때 앞 절이 통째로 사라진다.
   */
  MS.saveVerse = function (code, ch, v, text, stats) {
    var id = BK.chapterKey(code, ch);
    return DB.enqueue(id, function () {
      return DB.get("manuscripts", id).then(function (rec) {
        rec = rec || { id: id, book: code, ch: ch, verses: {}, jamo: 0, ms: 0 };
        var isNew = !rec.verses[v];
        rec.verses[v] = text;
        rec.updated = Date.now();
        rec.jamo = (rec.jamo || 0) + ((stats && stats.jamo) || 0);
        rec.ms = (rec.ms || 0) + ((stats && stats.ms) || 0);
        rec.doneCount = countKeys(rec.verses);
        return DB.put("manuscripts", rec).then(function () {
          ST.setChapter(code, ch, rec.doneCount, null);
          ST.setPosition(code, ch, v);
          ST.clearDraft();
          if (isNew) ST.addRecord((stats && stats.jamo) || 0, (stats && stats.ms) || 0, 1);
          return rec;
        });
      });
    });
  };

  function countKeys(o) {
    var n = 0;
    for (var k in o) if (o.hasOwnProperty(k) && o[k]) n++;
    return n;
  }

  /** 이어서 쓸 자리. 저장된 위치가 있으면 그 다음 절부터. */
  MS.nextPosition = function () {
    var pos = ST.position();
    if (pos && BK.byCode(pos.book)) {
      var p = ST.bookProgress(pos.book);
      var total = p.t[pos.ch - 1] || 0;
      var done = p.c[pos.ch - 1] || 0;
      if (total && done < total) return { book: pos.book, ch: pos.ch, v: done + 1 };
      // 그 장을 다 썼으면 다음으로 본문이 있는 장
      var nx = MS.firstUnfinished(pos.book, pos.ch + 1);
      if (nx) return nx;
    }
    return MS.firstUnfinished(null, 1);
  };

  /** 본문이 있으면서 아직 덜 쓴 첫 장. fromBook을 주면 그 책부터 훑는다. */
  MS.firstUnfinished = function (fromBook, fromCh) {
    var start = 0;
    if (fromBook) {
      var b = BK.byCode(fromBook);
      if (b) start = b.i;
    }
    var all = ST.progress();
    for (var i = start; i < BK.BOOKS.length; i++) {
      var code = BK.BOOKS[i].c;
      var p = all[code];
      if (!p) continue;
      var first = i === start && fromBook ? (fromCh || 1) : 1;
      for (var ch = first; ch <= p.t.length; ch++) {
        var total = p.t[ch - 1] || 0;
        if (!total) continue;
        var done = p.c[ch - 1] || 0;
        if (done < total) return { book: code, ch: ch, v: done + 1 };
      }
    }
    // 다 썼거나 본문이 없다 — 본문이 있는 첫 장으로 보낸다
    for (i = 0; i < BK.BOOKS.length; i++) {
      var pp = all[BK.BOOKS[i].c];
      if (!pp) continue;
      for (var c2 = 1; c2 <= pp.t.length; c2++) if (pp.t[c2 - 1]) return { book: BK.BOOKS[i].c, ch: c2, v: 1 };
    }
    return null;
  };

  // ------------------------------------------------------------- 백업

  /**
   * 원고 + 설정/진도, 그리고 본문(원하면).
   *
   * 본문을 함께 담는 건 **기기를 옮기기 위해서**다. 브라우저 저장소는 그 브라우저
   * 안에만 있어서, 컴퓨터에서 들여온 본문이 폰에는 없다. 파일 하나로 옮기면
   * 계정도 서버도 필요 없다 — 본문이 남의 서버에 복제되지 않는다는 점이 더 중요하다.
   *
   * 다만 이 파일에는 저작권이 있는 번역본이 들어간다. 본인 기기 사이에서 옮기는
   * 용도이고, 남에게 나눠 주는 용도가 아니다.
   */
  MS.exportAll = function (includeBible) {
    return DB.range("manuscripts", "0", "zzz").then(function (recs) {
      var out = {
        app: "bible-write",
        v: 1,
        at: new Date().toISOString(),
        store: ST.dump(),
        manuscripts: recs
      };
      if (!includeBible) return out;
      return DB.range("verses", "0", "zzz").then(function (vs) {
        out.verses = vs;
        return out;
      });
    });
  };

  MS.importAll = function (obj) {
    if (!obj || obj.app !== "bible-write") return Promise.reject(new Error("이 앱의 백업 파일이 아닙니다."));
    ST.restore(obj.store);
    return DB.putAll("manuscripts", obj.manuscripts || [])
      .then(function () { return DB.putAll("verses", obj.verses || []); })
      .then(function () {
        return {
          chapters: (obj.manuscripts || []).length,
          bible: (obj.verses || []).length
        };
      });
  };

  /** IndexedDB를 훑어 진도표를 다시 만든다. 진도가 어긋나 보일 때의 복구 수단. */
  MS.recomputeProgress = function () {
    return DB.range("manuscripts", "0", "zzz").then(function (recs) {
      var all = ST.progress();
      // 쓴 절 수만 지우고 전체 절 수(본문 정보)는 남긴다
      for (var code in all) if (all.hasOwnProperty(code)) {
        for (var i = 0; i < all[code].c.length; i++) all[code].c[i] = 0;
      }
      recs.forEach(function (r) {
        if (!all[r.book]) all[r.book] = { c: [], t: [] };
        var b = all[r.book];
        while (b.c.length < r.ch) b.c.push(0);
        while (b.t.length < r.ch) b.t.push(0);
        b.c[r.ch - 1] = countKeys(r.verses);
      });
      ST.replaceProgress(all);
      return recs.length;
    });
  };

  /** 한 장을 글로 이어 붙인다(내보내기·다시 읽기용). */
  MS.chapterText = function (code, ch) {
    return MS.getChapter(code, ch).then(function (rec) {
      if (!rec) return "";
      var nums = [];
      for (var k in rec.verses) if (rec.verses.hasOwnProperty(k)) nums.push(parseInt(k, 10));
      nums.sort(function (a, b) { return a - b; });
      return nums.map(function (n) { return n + " " + rec.verses[n]; }).join("\n");
    });
  };

  global.MS = MS;
})(window);
