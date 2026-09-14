(function () {
  "use strict";

  // ---------------------------------------------------------------------
  // 화면 조립
  // ---------------------------------------------------------------------

  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  var toastTimer = null;
  function toast(msg) {
    var t = $("toast");
    t.textContent = msg;
    t.hidden = false;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 2600);
  }

  // ------------------------------------------------------------- 화면 전환

  var views = ["today", "write", "index", "import", "settings"];

  function show(name) {
    for (var i = 0; i < views.length; i++) {
      $("view-" + views[i]).hidden = views[i] !== name;
    }
    var btns = $("tabs").querySelectorAll("button");
    for (i = 0; i < btns.length; i++) {
      btns[i].setAttribute("aria-selected", btns[i].getAttribute("data-view") === name ? "true" : "false");
    }
    if (name === "today") renderToday();
    if (name === "index") renderBooks();
    if (name === "import") renderSources();
    if (name === "write") enterWrite();
    window.scrollTo(0, 0);
  }

  $("tabs").addEventListener("click", function (e) {
    var b = e.target.closest ? e.target.closest("button[data-view]") : null;
    if (b) show(b.getAttribute("data-view"));
  });
  document.addEventListener("click", function (e) {
    var g = e.target.getAttribute && e.target.getAttribute("data-goto");
    if (g) show(g);
  });

  // ------------------------------------------------------------- 오늘

  function renderToday() {
    $("streakNum").textContent = ST.streak();
    var today = ST.todayRecord();
    $("todayVerses").textContent = today.verses || 0;
    $("todayMin").textContent = Math.round((today.ms || 0) / 60000);

    var o = ST.overall();
    var pct = o.verseTotal ? Math.round(o.verses / o.verseTotal * 100) : 0;
    $("overallBar").style.width = pct + "%";
    $("overallText").textContent = o.verseTotal
      ? "가지고 있는 본문 " + o.chapterTotal + "장 중 " + o.chapters + "장 완성 · " +
        o.verses.toLocaleString("ko-KR") + " / " + o.verseTotal.toLocaleString("ko-KR") + "절 (" + pct + "%)"
      : "아직 본문이 없습니다.";

    var has = BX.importedBooks().length > 0;
    $("emptyGuide").hidden = has;
    $("continueBtn").disabled = !has;

    var next = MS.nextPosition();
    $("continueWhere").textContent = next
      ? BK.label(next.book, next.ch, next.v) + "부터"
      : (has ? "가진 본문을 모두 필사했습니다." : "");

    renderRecent();
  }

  function renderRecent() {
    var box = $("recentList");
    box.innerHTML = "";
    DB.range("manuscripts", "0", "zzz").then(function (recs) {
      recs.sort(function (a, b) { return (b.updated || 0) - (a.updated || 0); });
      recs.slice(0, 5).forEach(function (r) {
        var p = ST.bookProgress(r.book);
        var total = p.t[r.ch - 1] || 0;
        var b = el("button", null);
        b.appendChild(el("span", null, BK.label(r.book, r.ch)));
        b.appendChild(el("span", "muted", (r.doneCount || 0) + (total ? " / " + total : "") + "절"));
        b.addEventListener("click", function () { openChapter(r.book, r.ch); });
        box.appendChild(b);
      });
    });
  }

  $("continueBtn").addEventListener("click", function () {
    var next = MS.nextPosition();
    if (!next) { toast("가진 본문을 모두 필사했습니다."); return; }
    openChapter(next.book, next.ch, next.v);
  });

  // ------------------------------------------------------------- 필사

  var state = { book: null, ch: 0, v: 1, verses: [], version: "" };
  var editor = null;
  var draftTimer = null;

  /**
   * 필사 탭을 눌러서 들어온 경우. 어느 장을 펼지 아직 정해지지 않았으므로
   * 이어서 쓸 자리를 찾아 연다. 그것마저 없으면(본문을 한 장도 안 가져왔다면)
   * 빈 화면을 보여주는 대신 왜 비었는지와 무엇을 하면 되는지를 말해 준다.
   */
  function enterWrite() {
    if (state.book) {
      setWriteEmpty(false);
      setTimeout(function () { editor && editor.focus(); }, 60);
      return;
    }
    var next = MS.nextPosition();
    if (next) { openChapter(next.book, next.ch, next.v); return; }
    setWriteEmpty(true);
  }

  function setWriteEmpty(empty) {
    $("writeEmpty").hidden = !empty;
    $("writeBody").hidden = empty;
  }

  function openChapter(code, ch, v) {
    return BX.getChapter(code, ch).then(function (rec) {
      if (!rec || !rec.verses || !rec.verses.length) {
        toast("이 장은 본문이 없습니다. 먼저 가져오세요.");
        show("import");
        $("impBook").value = code;
        $("impChapter").value = ch;
        return;
      }
      state.book = code;
      state.ch = ch;
      state.verses = rec.verses;
      state.version = rec.v || "";
      show("write");
      goVerse(v || firstUnwritten(code, ch));
    });
  }

  function firstUnwritten(code, ch) {
    var p = ST.bookProgress(code);
    var done = p.c[ch - 1] || 0;
    return Math.min(done + 1, state.verses.length || 1);
  }

  function goVerse(v) {
    v = Math.max(1, Math.min(v, state.verses.length));
    state.v = v;

    $("writeWhere").textContent = BK.label(state.book, state.ch, v);
    $("writeProgress").textContent = v + " / " + state.verses.length + "절" +
      (state.version ? " · " + state.version : "");
    var p = ST.bookProgress(state.book);
    var done = p.c[state.ch - 1] || 0;
    $("chapterBar").style.width = (state.verses.length ? done / state.verses.length * 100 : 0) + "%";
    $("prevVerse").disabled = v <= 1;
    $("nextVerse").disabled = v >= state.verses.length;

    var d = ST.draft();
    var draft = d && d.book === state.book && d.ch === state.ch && d.v === v ? d.text : "";

    // 이미 쓴 절을 다시 열면 그때 쓴 글을 보여준다(다시 쓸 수도, 그냥 볼 수도 있게)
    MS.getChapter(state.book, state.ch).then(function (rec) {
      var written = rec && rec.verses ? rec.verses[v] : null;
      editor.setVerse(state.verses[v - 1] || "", draft || "");
      if (written && !draft) {
        $("liveStats").textContent = "이미 쓴 절입니다. 다시 쓰면 덮어씁니다.";
      } else {
        $("liveStats").textContent = "";
      }
      editor.focus();
    });
  }

  function advance() {
    if (state.v < state.verses.length) { goVerse(state.v + 1); return; }
    // 장을 다 썼다
    toast(BK.label(state.book, state.ch) + " 필사를 마쳤습니다.");
    var next = MS.firstUnfinished(state.book, state.ch + 1);
    if (next && next.book) {
      openChapter(next.book, next.ch, next.v);
    } else {
      show("today");
    }
  }

  function saveCurrent(text, stats, silent) {
    return MS.saveVerse(state.book, state.ch, state.v, text, stats).then(function () {
      var p = ST.bookProgress(state.book);
      var done = p.c[state.ch - 1] || 0;
      $("chapterBar").style.width = (done / state.verses.length * 100) + "%";
      if (!silent) {
        var s = stats || {};
        var parts = [];
        if (s.cpm) parts.push(s.cpm + "타/분");
        if (s.accuracy != null) parts.push("정확도 " + Math.round(s.accuracy * 100) + "%");
        $("liveStats").textContent = parts.join(" · ");
      }
    });
  }

  editor = EDT.create({
    input: $("scribeInput"),
    layer: $("scribeLayer"),
    source: $("source"),

    onChange: function (r, session) {
      if (draftTimer) clearTimeout(draftTimer);
      draftTimer = setTimeout(function () {
        if (state.book) ST.setDraft(state.book, state.ch, state.v, editor.value());
      }, 400);
      if (!r.done) {
        var st = session.stats();
        var parts = [];
        if (st.cpm) parts.push(st.cpm + "타/분");
        if (st.errorEvents) parts.push("오타 " + st.errorEvents);
        $("liveStats").textContent = r.typedLength ? parts.join(" · ") : "";
      }
    },

    onDone: function (text, stats) {
      saveCurrent(text, stats).then(function () {
        if (ST.settings().autoNext) advance();
        else $("liveStats").textContent = "다 썼습니다. Enter 를 누르면 다음 절로 갑니다.";
      });
    },

    // Enter — 아직 덜 썼어도 지금까지 쓴 대로 저장하고 넘어간다
    onEnter: function (text, stats) {
      if (!state.book) return;
      if (!text) { advance(); return; }
      saveCurrent(text, stats, true).then(advance);
    },

    onSkip: function () { advance(); }
  });

  $("prevVerse").addEventListener("click", function () { goVerse(state.v - 1); });
  $("nextVerse").addEventListener("click", function () { goVerse(state.v + 1); });
  $("skipVerse").addEventListener("click", function () { advance(); });

  // 탭을 닫기 직전에는 IndexedDB 쓰기가 끝난다는 보장이 없다. 쓰던 절은
  // localStorage에 동기로 적어 둔다 — 수백 바이트라 부담이 없다.
  window.addEventListener("pagehide", function () {
    if (state.book && editor.value()) ST.setDraft(state.book, state.ch, state.v, editor.value());
  });

  // ------------------------------------------------------------- 목차

  var filter = "all";
  $("testamentSeg").addEventListener("click", function (e) {
    var b = e.target.closest ? e.target.closest(".seg__btn") : null;
    if (!b) return;
    filter = b.getAttribute("data-t");
    var all = $("testamentSeg").querySelectorAll(".seg__btn");
    for (var i = 0; i < all.length; i++) all[i].className = "seg__btn" + (all[i] === b ? " is-on" : "");
    renderBooks();
  });

  function renderBooks() {
    var list = $("bookList");
    list.innerHTML = "";
    var prog = ST.progress();
    var src = ST.sources();

    BK.BOOKS.forEach(function (b) {
      if (filter === "o" || filter === "n") { if (b.t !== filter) return; }
      if (filter === "have" && !src[b.c]) return;

      var p = prog[b.c] || { c: [], t: [] };
      var haveCh = 0, doneCh = 0;
      for (var i = 0; i < b.ch; i++) {
        if (p.t[i]) haveCh++;
        if (p.t[i] && (p.c[i] || 0) >= p.t[i]) doneCh++;
      }

      var wrap = el("div", "book");
      var head = el("button", "book__head");
      head.appendChild(el("span", "book__name", b.k));
      head.appendChild(el("span", "book__meta",
        haveCh ? doneCh + " / " + haveCh + "장 완성" : "본문 없음"));
      wrap.appendChild(head);

      var body = el("div", "book__body");
      body.hidden = true;
      head.addEventListener("click", function () {
        if (body.hidden && !body.childNodes.length) fillChapters(body, b, p);
        body.hidden = !body.hidden;
      });
      wrap.appendChild(body);
      list.appendChild(wrap);
    });

    if (!list.childNodes.length) list.appendChild(el("p", "muted", "해당하는 책이 없습니다."));
  }

  function fillChapters(body, b, p) {
    var grid = el("div", "chapters");
    for (var ch = 1; ch <= b.ch; ch++) {
      (function (ch) {
        var total = p.t[ch - 1] || 0;
        var done = p.c[ch - 1] || 0;
        var cls = "chip";
        if (total) cls += done >= total ? " full" : (done > 0 ? " part" : " has");
        var chip = el("button", cls, String(ch));
        chip.title = total ? done + " / " + total + "절" : "본문 없음";
        if (!total) {
          chip.addEventListener("click", function () {
            show("import");
            $("impBook").value = b.c;
            $("impChapter").value = ch;
            $("impText").focus();
          });
        } else {
          chip.addEventListener("click", function () { openChapter(b.c, ch); });
        }
        grid.appendChild(chip);
      })(ch);
    }
    body.appendChild(grid);
  }

  // ------------------------------------------------------------- 본문 가져오기

  (function fillBookSelect() {
    var sel = $("impBook");
    BK.BOOKS.forEach(function (b) {
      var o = el("option", null, b.k);
      o.value = b.c;
      sel.appendChild(o);
    });
    var s2 = $("impStrategy");
    PS.STRATEGIES.forEach(function (s) {
      var o = el("option", null, s.label);
      o.value = s.id;
      s2.appendChild(o);
    });
  })();

  var parsed = null;   // 미리보기에서 사람이 고친 결과가 진짜다

  function runParse() {
    var raw = $("impText").value;
    if (!raw.replace(/\s/g, "")) { $("previewCard").hidden = true; return; }

    var code = $("impBook").value;
    var ch = parseInt($("impChapter").value, 10) || 1;
    var hint = { book: code, ch: ch };
    var mode = $("impStrategy").value;

    var r = mode === "auto" ? PS.parse(raw, hint) : PS.reparse(raw, mode, hint);
    if (!r) { toast("그 방식으로는 읽을 수 없습니다."); return; }

    // 붙여넣은 글에서 책·장을 알아냈으면 입력칸에도 반영한다
    var head = PS.sniffHeader(raw);
    if (head.book && head.book !== code) { $("impBook").value = head.book; }
    if (head.ch && head.ch !== ch) { $("impChapter").value = head.ch; }

    parsed = r;
    renderPreview();
  }

  function renderPreview() {
    var r = parsed;
    $("previewCard").hidden = false;

    var verses = r.chapters[0] ? r.chapters[0].verses : [];
    var conf = r.confidence;
    var badge = $("impBadge");
    badge.textContent = (PS.STRATEGIES.filter(function (s) { return s.id === r.strategy; })[0] || {}).label +
      " · " + verses.length + "절 · 신뢰도 " + (conf >= 0.8 ? "높음" : conf >= 0.6 ? "보통" : "낮음");
    badge.className = "badge " + (conf >= 0.8 ? "good" : conf >= 0.6 ? "" : "warn");
    $("impStrategy").value = r.strategy;

    var warnBox = $("impWarnings");
    warnBox.innerHTML = "";
    if (r.warnings.length) {
      var w = el("div", "warn-list");
      r.warnings.forEach(function (t) { w.appendChild(el("div", null, t)); });
      warnBox.appendChild(w);
    }

    var dropBox = $("impDropped");
    dropBox.innerHTML = "";
    if (r.dropped.length) {
      dropBox.appendChild(document.createTextNode("버린 줄: "));
      r.dropped.slice(0, 12).forEach(function (d) {
        var s = el("span", null, d.line.slice(0, 24));
        s.title = d.reason;
        dropBox.appendChild(s);
      });
    }

    var box = $("impPreview");
    box.innerHTML = "";
    verses.forEach(function (v, i) {
      var row = el("div", "pv" + (v.t ? "" : " bad"));
      row.appendChild(el("div", "pv__n", String(v.n)));

      var ta = el("textarea", "pv__t");
      ta.value = v.t;
      ta.rows = 1;
      ta.addEventListener("input", function () {
        v.t = ta.value;
        ta.style.height = "auto";
        ta.style.height = ta.scrollHeight + "px";
      });
      row.appendChild(ta);

      var btns = el("div", "pv__btns");
      if (i > 0) {
        var up = el("button", "pv__btn", "↑붙이기");
        up.title = "앞 절에 이어 붙이기";
        up.addEventListener("click", function () { mergeUp(verses, i); });
        btns.appendChild(up);
      }
      var sp = el("button", "pv__btn", "나누기");
      sp.title = "커서 자리에서 두 절로 나누기";
      sp.addEventListener("click", function () { splitAt(verses, i, ta.selectionStart); });
      btns.appendChild(sp);
      row.appendChild(btns);

      box.appendChild(row);
      setTimeout(function () { ta.style.height = ta.scrollHeight + "px"; }, 0);
    });

    var low = conf < 0.6;
    $("impConfirmWrap").hidden = !low;
    $("impConfirm").checked = false;
    $("impSave").disabled = low;
    $("impSaveNext").disabled = low;
  }

  // 파서가 한 절이라도 틀리면 손으로 고칠 수 있어야 한다. 이게 없으면
  // 잘못 쪼개진 본문을 그대로 저장하게 되고, 필사 내내 오타로 표시된다.
  function mergeUp(verses, i) {
    verses[i - 1].t = (verses[i - 1].t + " " + verses[i].t).replace(/\s+/g, " ");
    verses.splice(i, 1);
    renumber(verses);
    renderPreview();
  }

  function splitAt(verses, i, pos) {
    var t = verses[i].t;
    if (pos == null || pos <= 0 || pos >= t.length) { toast("나눌 자리에 커서를 두세요."); return; }
    var head = t.slice(0, pos).replace(/\s+$/, "");
    var tail = t.slice(pos).replace(/^\s+/, "");
    verses[i].t = head;
    verses.splice(i + 1, 0, { n: verses[i].n + 1, t: tail });
    renumber(verses);
    renderPreview();
  }

  function renumber(verses) {
    var start = verses.length ? verses[0].n : 1;
    for (var i = 0; i < verses.length; i++) verses[i].n = start + i;
  }

  // 붙여넣기는 한 번에 들어오지만 손으로 고칠 수도 있어서 조금 기다렸다 읽는다.
  // (필사 초안 타이머와 섞으면 필사 중 저장이 취소되므로 따로 둔다)
  var parseTimer = null;
  $("impText").addEventListener("input", function () {
    if (parseTimer) clearTimeout(parseTimer);
    parseTimer = setTimeout(runParse, 150);
  });
  $("impParse").addEventListener("click", runParse);
  $("impStrategy").addEventListener("change", runParse);
  $("impConfirm").addEventListener("change", function () {
    $("impSave").disabled = !this.checked;
    $("impSaveNext").disabled = !this.checked;
  });

  function saveImport(thenNext) {
    if (!parsed) return;
    var code = $("impBook").value;
    var version = $("impVersion").value.replace(/^\s+|\s+$/g, "");
    var chapters = {};
    var baseCh = parseInt($("impChapter").value, 10) || 1;

    parsed.chapters.forEach(function (c, idx) {
      var num = c.ch || (baseCh + idx);
      chapters[num] = PS.toVerseArray(c.verses);
    });

    var nums = [];
    for (var k in chapters) if (chapters.hasOwnProperty(k)) nums.push(parseInt(k, 10));

    var existing = nums.filter(function (n) { return BX.hasChapter(code, n); });
    if (existing.length && !confirm(BK.byCode(code).k + " " + existing.join(", ") + "장은 이미 본문이 있습니다. 덮어쓸까요?")) return;

    BX.putChapters(code, chapters, version).then(function () {
      toast(BK.byCode(code).k + " " + nums.join(", ") + "장을 저장했습니다.");
      $("impText").value = "";
      $("previewCard").hidden = true;
      parsed = null;
      renderSources();
      if (thenNext) {
        $("impChapter").value = Math.max.apply(null, nums) + 1;
        $("impText").focus();
      }
    }, function (err) {
      toast("저장하지 못했습니다: " + (err && err.message ? err.message : err));
    });
  }

  $("impSave").addEventListener("click", function () { saveImport(false); });
  $("impSaveNext").addEventListener("click", function () { saveImport(true); });

  function renderSources() {
    var box = $("sourceList");
    box.innerHTML = "";
    var books = BX.importedBooks();
    var src = ST.sources();
    if (!books.length) {
      box.appendChild(el("p", "muted", "아직 가져온 본문이 없습니다."));
      $("expIndex").disabled = true;
      return;
    }
    $("expIndex").disabled = false;

    books.forEach(function (b) {
      var info = src[b.c] || {};
      var row = el("div", "src-row");
      row.appendChild(el("span", null, b.k));
      row.appendChild(el("span", "muted", (info.chapters || 0) + "장" + (info.name ? " · " + info.name : "")));

      var exp = el("button", "btn btn--quiet", "파일로");
      exp.addEventListener("click", function () {
        SRC.toFileText(b.c).then(function (text) {
          if (!text) { toast("내보낼 본문이 없습니다."); return; }
          SRC.download(b.c + ".js", text, "text/javascript");
        });
      });
      row.appendChild(exp);

      var del = el("button", "btn btn--quiet", "삭제");
      del.addEventListener("click", function () {
        if (!confirm(b.k + " 본문을 지울까요? 쓴 원고는 남습니다.")) return;
        BX.deleteBook(b.c).then(function () { renderSources(); toast(b.k + " 본문을 지웠습니다."); });
      });
      row.appendChild(del);

      box.appendChild(row);
    });
  }

  $("expIndex").addEventListener("click", function () {
    SRC.download("index.js", SRC.toIndexText(), "text/javascript");
  });

  // ------------------------------------------------------------- 설정

  function applySettings() {
    var s = ST.settings();
    document.documentElement.style.setProperty("--scribe-size", s.fontSize + "px");
    $("setFontSize").value = s.fontSize;
    $("fontSizeLabel").textContent = s.fontSize + "px";
    $("setAutoNext").checked = !!s.autoNext;
  }

  $("setFontSize").addEventListener("input", function () {
    ST.saveSettings({ fontSize: parseInt(this.value, 10) });
    applySettings();
  });
  $("setAutoNext").addEventListener("change", function () {
    ST.saveSettings({ autoNext: this.checked });
  });

  $("backupBtn").addEventListener("click", function () {
    MS.exportAll().then(function (data) {
      SRC.download("성경쓰기-백업-" + ST.today() + ".json", JSON.stringify(data), "application/json");
      toast("백업 파일을 내려받았습니다.");
    });
  });

  $("restoreBtn").addEventListener("click", function () { $("restoreFile").click(); });
  $("restoreFile").addEventListener("change", function () {
    var f = this.files && this.files[0];
    if (!f) return;
    var reader = new FileReader();
    reader.onload = function () {
      var obj;
      try { obj = JSON.parse(reader.result); }
      catch (e) { toast("읽을 수 없는 파일입니다."); return; }
      MS.importAll(obj).then(function (n) {
        toast(n + "개 장의 원고를 되살렸습니다.");
        applySettings();
        renderToday();
      }, function (err) { toast(err.message); });
    };
    reader.readAsText(f);
    this.value = "";
  });

  $("recalcBtn").addEventListener("click", function () {
    MS.recomputeProgress().then(function (n) {
      toast(n + "개 장을 다시 세었습니다.");
      renderToday();
    });
  });

  // ------------------------------------------------------------- 시작

  function boot() {
    applySettings();

    DB.available().then(function (ok) {
      if (!ok) {
        var n = $("noticeBox");
        n.hidden = false;
        n.textContent = "이 브라우저에서는 저장소를 쓸 수 없습니다(파일로 직접 연 경우 흔합니다). " +
          "웹 주소로 열면 쓴 글이 남습니다. 지금은 이 창을 닫으면 사라집니다.";
      }
      if (!ST.persistent()) {
        var n2 = $("noticeBox");
        n2.hidden = false;
        n2.textContent = "이 브라우저에는 기록이 저장되지 않습니다(시크릿 모드 등). 창을 닫으면 사라집니다.";
      }
      return SRC.syncFromFiles();
    }).then(function (n) {
      if (n) toast(n + "권의 본문 파일을 읽었습니다.");
      renderToday();
      show("today");
    }, function () {
      renderToday();
      show("today");
    });

    DB.estimate().then(function (est) {
      if (!est || !est.usage) return;
      $("storageInfo").textContent = "지금 쓰는 저장 공간 " + (est.usage / 1048576).toFixed(1) + "MB" +
        (est.quota ? " / " + (est.quota / 1048576).toFixed(0) + "MB" : "");
    });

    $("versionLine").textContent = "성경쓰기 · 66권 " + BK.totalChapters().toLocaleString("ko-KR") + "장";

    // 서비스워커는 있으면 좋고 없어도 그만이다. 다른 페이지 안에 끼워 넣어 열린
    // 경우(샌드박스 iframe)에는 등록을 시도하는 것만으로 예외가 나기도 해서,
    // 통째로 감싼다 — 여기서 터지면 앱이 멀쩡히 떠 있어도 콘솔이 붉어진다.
    try {
      if ("serviceWorker" in navigator && location.protocol.indexOf("http") === 0) {
        navigator.serviceWorker.register("sw.js").catch(function () { /* 없어도 그만 */ });
        var refreshed = false;
        navigator.serviceWorker.addEventListener("controllerchange", function () {
          if (refreshed) return;
          refreshed = true;
          location.reload();
        });
      }
    } catch (e) { /* 없어도 그만 */ }
  }

  boot();
})();
