(function (global) {
  "use strict";

  // ---------------------------------------------------------------------
  // 붙여넣기 파서 — 복사해 온 성경 한 장을 절 단위로 쪼갠다.
  // ---------------------------------------------------------------------
  // 성경 사이트·앱마다 복사 결과가 제각각이다. 절 번호가 앞에 붙기도, 줄바꿈만
  // 있기도, 한 줄에 여러 절이 이어지기도 한다. 전수 대응은 불가능하다.
  //
  // 그래서 목표를 "100% 자동 인식"으로 잡지 않는다. **여러 방식으로 쪼개 본 뒤
  // 가장 그럴듯한 걸 고르고, 나머지는 사람이 1분 안에 고치게 한다.** 잘못
  // 저장된 본문은 필사하는 내내 "틀렸다"고 표시되므로, 틀린 채로 통과시키는
  // 것보다 사람에게 물어보는 쪽이 훨씬 싸다.

  var PS = {};

  PS.STRATEGIES = [
    { id: "S1", label: "줄머리 절 번호 (1 태초에…)" },
    { id: "S2", label: "한 줄에 여러 절 (1 태초에… 2 땅이…)" },
    { id: "S3", label: "줄바꿈만 (번호 없음)" },
    { id: "S4", label: "장:절 표기 (1:1 태초에…)" },
    { id: "S5", label: "탭/막대 구분 (표 복사)" }
  ];

  // 개역개정·개역한글은 거의 모든 절이 -라, -다, -니라로 끝난다. 절이 제대로
  // 끊겼는지 재는 데 이보다 강한 신호가 없다.
  var ENDING = /(니라|더라|하라|이라|로다|리라|으라|았다|었다|한다|이다|없다|같다|라$|다$|[.!?"')\]…])\s*$/;

  // 숫자 뒤에 이런 말이 오면 절 번호가 아니라 본문 속 수량이다("430년", "열두 지파").
  var UNIT = /^(년|일|월|명|절|장|편|세|척|규빗|달란트|세겔|배|번|째|만|천|백|시|분|겹|권|되|마리|사람|자손|지파|족속)/;

  var SUPER = { "¹": "1", "²": "2", "³": "3", "⁰": "0", "⁴": "4", "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9" };

  // ------------------------------------------------------------- 전처리

  function prep(raw) {
    var s = String(raw == null ? "" : raw);
    // 위첨자 절 번호를 보통 숫자로. 일부 사이트가 이렇게 준다.
    s = s.replace(/[¹²³⁰⁴-⁹]/g, function (c) { return SUPER[c] || c; });
    s = NM.normalizeSource(s);
    s = stripFootnotes(s);
    var lines = s.split("\n");
    var out = [];
    for (var i = 0; i < lines.length; i++) {
      var t = lines[i].replace(/^\s+|\s+$/g, "");
      if (t) out.push(t);
    }
    return out;
  }

  /**
   * 각주 표시를 걷어낸다.
   *
   * 대한성서공회 읽기 페이지에서 복사하면 각주 번호가 본문에 붙어 온다.
   *   "땅이 1)혼돈하고 공허하며 …"
   * 그대로 두면 필사할 때 "1)"까지 쳐야 한다.
   *
   * 절 번호 표기("1) 태초에…")와 헷갈리지 않는 이유는 **띄어쓰기**다. 각주는
   * 뒤 글자에 딱 붙어 있고, 절 번호는 반드시 한 칸 띄어져 있다. 붙어 있을 때만 지운다.
   */
  function stripFootnotes(s) {
    return s.replace(/(^|[^0-9])([0-9]{1,2})\)(?=[가-힣])/g, "$1");
  }

  function isNoise(line) {
    if (/대한성서공회|©|Copyright|copyright|http/.test(line)) return "출처·저작권 줄";
    if (/^[가-힣]{1,10}\s*\d{1,3}\s*장?\s*$/.test(line)) return "장 제목 줄";
    if (/^\d{1,3}\s*장\s*$/.test(line)) return "장 제목 줄";
    if (/^[가-힣]{1,10}\s*\d{1,3}\s*[:：]\s*\d{1,3}(\s*[-~]\s*\d{1,3})?\s*$/.test(line)) return "구절 표기 줄";
    return null;
  }

  /**
   * 소제목 판별. 어휘("~하시다", "~의 족보")로 맞히려 들면 본문까지 지운다.
   * 그래서 형태만 본다 — 번호가 없고, 짧고, 문장으로 끝나지 않고, 이웃 줄은 번호를 가짐.
   */
  function isTitle(line, lines, i) {
    if (line.length >= 25) return false;
    if (ENDING.test(line)) return false;
    var next = lines[i + 1] || "";
    return /^\d{1,3}[.)\]:]?\s/.test(next) || /^\[\d{1,3}\]/.test(next);
  }

  // ------------------------------------------------------------- 쪼개기 5종

  function s1(lines) {
    var verses = [], dropped = [];
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      var noise = isNoise(line);
      if (noise) { dropped.push({ line: line, reason: noise }); continue; }

      var m = /^\[(\d{1,3})\]\s*(.*)$/.exec(line) || /^(\d{1,3})\s*[.)\]:]?\s+(.*)$/.exec(line);
      if (m) { verses.push({ n: parseInt(m[1], 10), t: m[2] }); continue; }

      // 번호가 저 혼자 한 줄을 차지하는 경우 — 다음 줄이 그 절의 본문이다
      if (/^\d{1,3}$/.test(line) && lines[i + 1]) {
        verses.push({ n: parseInt(line, 10), t: lines[i + 1] });
        i++;
        continue;
      }
      if (verses.length && !isTitle(line, lines, i)) {
        verses[verses.length - 1].t += " " + line;   // 화면 폭 때문에 잘린 줄
      } else {
        dropped.push({ line: line, reason: "소제목으로 판단" });
      }
    }
    return { verses: verses, dropped: dropped };
  }

  function s2(lines) {
    var dropped = [], keep = [];
    for (var i = 0; i < lines.length; i++) {
      var noise = isNoise(lines[i]);
      if (noise) dropped.push({ line: lines[i], reason: noise });
      else keep.push(lines[i]);
    }
    var text = keep.join(" ");
    var re = /(^|\s)(\d{1,3})\s*(?=[가-힣"'(“])/g;
    var found = [], m;
    while ((m = re.exec(text))) {
      var after = text.slice(m.index + m[0].length);
      if (UNIT.test(after)) continue;              // "430년" 같은 본문 속 수량
      found.push({ at: m.index + m[1].length, n: parseInt(m[2], 10), end: m.index + m[0].length });
      re.lastIndex = m.index + m[0].length;
    }

    // 본문 속 숫자를 거르는 진짜 방패는 여기다: **절 번호는 1씩 늘어난다.**
    // "무리가 12 지파로 나뉘니라"의 12는 4절 자리에 있을 리 없으므로 떨어져 나가고,
    // 그 자리의 글은 앞 절에 이어 붙는다. 단위 목록(UNIT)은 보조일 뿐이다.
    var marks = [], expect = found.length ? found[0].n : 1;
    for (i = 0; i < found.length; i++) {
      if (found[i].n !== expect) continue;
      marks.push(found[i]);
      expect++;
    }

    var verses = [];
    for (i = 0; i < marks.length; i++) {
      var stop = i + 1 < marks.length ? marks[i + 1].at : text.length;
      verses.push({ n: marks[i].n, t: text.slice(marks[i].end, stop).replace(/^\s+|\s+$/g, "") });
    }
    return { verses: verses, dropped: dropped };
  }

  function s3(lines) {
    var verses = [], dropped = [], buf = "";
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      var noise = isNoise(line);
      if (noise) { dropped.push({ line: line, reason: noise }); continue; }
      if (!buf && isTitle(line, lines, i)) { dropped.push({ line: line, reason: "소제목으로 판단" }); continue; }
      buf = buf ? buf + " " + line : line;
      // 문장이 끝나지 않았으면 다음 줄까지가 한 절이다(화면 폭에서 잘린 경우)
      if (ENDING.test(buf)) { verses.push({ n: verses.length + 1, t: buf }); buf = ""; }
    }
    if (buf) verses.push({ n: verses.length + 1, t: buf });
    return { verses: verses, dropped: dropped };
  }

  function s4(lines) {
    var chapters = {}, dropped = [], order = [];
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      var m = /^(\d{1,3})\s*[:：]\s*(\d{1,3})\s+(.*)$/.exec(line);
      if (!m) {
        var last = order.length ? chapters[order[order.length - 1]] : null;
        if (last && last.length && !isNoise(line)) last[last.length - 1].t += " " + line;
        else dropped.push({ line: line, reason: isNoise(line) || "형식에 맞지 않음" });
        continue;
      }
      var ch = parseInt(m[1], 10);
      if (!chapters[ch]) { chapters[ch] = []; order.push(ch); }
      chapters[ch].push({ n: parseInt(m[2], 10), t: m[3] });
    }
    return { chapterMap: chapters, order: order, dropped: dropped };
  }

  function s5(rawLines) {
    var verses = [], dropped = [], chapter = null;
    for (var i = 0; i < rawLines.length; i++) {
      var cells = rawLines[i].split(/\t|\s*\|\s*/);
      var nums = [], text = "";
      for (var k = 0; k < cells.length; k++) {
        var c = cells[k].replace(/^\s+|\s+$/g, "");
        if (!c) continue;
        // 칸의 순서를 믿지 않는다. 숫자 칸은 숫자대로 모으고, 글 칸은 가장 긴 것을
        // 본문으로 본다("창세기 | 1 | 1 | 본문"과 "1 | 1 | 본문"을 함께 받기 위해).
        if (/^\d{1,3}$/.test(c)) nums.push(parseInt(c, 10));
        else if (c.length > text.length) text = c;
      }
      if (!text || !nums.length) { dropped.push({ line: rawLines[i], reason: "형식에 맞지 않음" }); continue; }
      if (nums.length >= 2) { chapter = nums[nums.length - 2]; }
      verses.push({ n: nums[nums.length - 1], t: text });
    }
    return { verses: verses, dropped: dropped, ch: chapter };
  }

  // ------------------------------------------------------------- 채점

  /**
   * @param synthetic 번호를 본문에서 읽은 게 아니라 순서대로 매긴 경우(S3).
   *   이때 "번호가 1씩 이어진다"는 건 당연한 말이라 신호가 아니다. 0.5로 고정하지
   *   않으면 S3이 언제나 만점을 받아 다른 방식을 전부 이겨버린다.
   */
  function score(verses, expected, synthetic) {
    if (!verses || verses.length < 2) return 0;
    var i;

    // 번호가 1씩 이어지는가 — 가장 강한 신호
    var seq;
    if (synthetic) {
      seq = 0.5;
    } else {
      var steps = 0;
      for (i = 1; i < verses.length; i++) if (verses[i].n === verses[i - 1].n + 1) steps++;
      seq = steps / (verses.length - 1);
      if (verses[0].n !== 1) seq *= 0.8;   // 1절부터가 아니면 조금 깎는다(가능은 하다)
    }

    // 절 길이가 성경다운가
    var total = 0;
    for (i = 0; i < verses.length; i++) total += verses[i].t.length;
    var avg = total / verses.length;
    var len = avg >= 10 && avg <= 120 ? 1 : (avg < 10 ? avg / 10 : Math.max(0, 1 - (avg - 120) / 200));

    // 절 끝이 문장으로 끝나는가
    var ends = 0;
    for (i = 0; i < verses.length; i++) if (ENDING.test(verses[i].t)) ends++;
    var end = ends / verses.length;

    // 기대 절 수와 맞는가 (알 때만)
    var cnt = 0.5;
    if (expected) cnt = Math.max(0, 1 - Math.abs(verses.length - expected) / expected);

    return 0.5 * seq + 0.2 * len + 0.15 * end + 0.15 * cnt;
  }

  /** 장이 여럿이면 장마다 따로 채점해 절 수로 가중평균한다.
   *  장을 통째로 이어 붙여 채점하면 장이 바뀌는 자리(…1:2 다음 2:1)가
   *  번호 역행으로 잡혀 멀쩡한 결과가 깎인다. */
  function scoreChapters(chapters, expected, synthetic) {
    var sum = 0, n = 0;
    for (var i = 0; i < chapters.length; i++) {
      var vs = chapters[i].verses;
      if (!vs || !vs.length) continue;
      sum += score(vs, expected, synthetic) * vs.length;
      n += vs.length;
    }
    return n ? sum / n : 0;
  }

  /** 줄머리에 번호가 붙은 줄의 비율. S3(번호 없음)을 골라도 되는지 판단하는 데 쓴다. */
  function numberedRatio(lines) {
    if (!lines.length) return 0;
    var n = 0;
    for (var i = 0; i < lines.length; i++) {
      if (/^\d{1,3}[.)\]:]?\s/.test(lines[i]) || /^\[\d{1,3}\]/.test(lines[i]) || /^\d{1,3}\s*[:：]\s*\d{1,3}\s/.test(lines[i])) n++;
    }
    return n / lines.length;
  }

  // ------------------------------------------------------------- 공개 API

  /**
   * @param raw  붙여넣은 원문
   * @param hint { book:"GEN", ch:1, expected:31 } — 아는 만큼만
   */
  PS.parse = function (raw, hint) {
    hint = hint || {};
    var best = null;
    var ids = ["S1", "S2", "S3", "S4", "S5"];
    for (var i = 0; i < ids.length; i++) {
      var r = PS.reparse(raw, ids[i], hint);
      if (!r) continue;
      if (!best || r.confidence > best.confidence) best = r;
    }
    if (!best) {
      best = { strategy: "S3", confidence: 0, chapters: [], dropped: [], warnings: ["절을 하나도 찾지 못했습니다."] };
    }
    return best;
  };

  PS.reparse = function (raw, strategy, hint) {
    hint = hint || {};
    var lines = prep(raw);
    if (!lines.length) return null;

    var head = PS.sniffHeader(raw);
    var book = hint.book || head.book || null;
    var ch = hint.ch || head.ch || null;

    var res, chapters = [], dropped = [];

    if (strategy === "S4") {
      res = s4(lines);
      dropped = res.dropped;
      for (var i = 0; i < res.order.length; i++) {
        chapters.push({ book: book, ch: res.order[i], verses: res.chapterMap[res.order[i]] });
      }
    } else if (strategy === "S5") {
      if (String(raw).indexOf("\t") < 0 && String(raw).indexOf("|") < 0) return null;
      res = s5(String(raw).split(/\r\n?|\n/));
      dropped = res.dropped;
      chapters = [{ book: book, ch: res.ch || ch, verses: res.verses }];
    } else {
      res = strategy === "S1" ? s1(lines) : strategy === "S2" ? s2(lines) : s3(lines);
      dropped = res.dropped;
      chapters = [{ book: book, ch: ch, verses: res.verses }];
    }

    var conf = scoreChapters(chapters, hint.expected, strategy === "S3");
    // 줄머리에 번호가 뻔히 붙어 있는데 번호 없는 방식으로 읽었다면 믿을 게 못 된다.
    // 그대로 통과시키면 "3 빛을 보시고"가 2절 본문이 되어 번호까지 필사하게 된다.
    if (strategy === "S3" && numberedRatio(lines) >= 0.5) conf *= 0.5;

    var out = {
      strategy: strategy,
      confidence: conf,
      chapters: chapters,
      dropped: dropped,
      warnings: []
    };
    out.warnings = PS.validate(out);
    return out;
  };

  /** 붙여넣은 글 첫머리에서 "창세기 1장" 같은 표기를 찾아본다. */
  PS.sniffHeader = function (raw) {
    var lines = prep(raw).slice(0, 4);
    for (var i = 0; i < lines.length; i++) {
      var m = /^([가-힣]{1,10})\s*(\d{1,3})\s*(장|[:：]\s*\d{1,3})?/.exec(lines[i]);
      if (!m) continue;
      var b = BK.byName(m[1]);
      if (b) return { book: b.c, ch: parseInt(m[2], 10) };
    }
    return { book: null, ch: null };
  };

  PS.validate = function (result) {
    var w = [];
    for (var c = 0; c < result.chapters.length; c++) {
      var vs = result.chapters[c].verses;
      if (!vs.length) { w.push("절을 찾지 못했습니다."); continue; }
      if (vs.length === 1) w.push("절이 하나뿐입니다 — 쪼개기에 실패했을 수 있습니다.");
      if (vs[0].n !== 1) w.push("1절이 아니라 " + vs[0].n + "절부터 시작합니다.");
      for (var i = 0; i < vs.length; i++) {
        if (!vs[i].t) w.push(vs[i].n + "절이 비어 있습니다.");
        if (vs[i].t.length > 500) w.push(vs[i].n + "절이 " + vs[i].t.length + "자입니다 — 두 절이 붙었을 수 있습니다.");
        if (i > 0) {
          if (vs[i].n === vs[i - 1].n) w.push(vs[i].n + "절이 두 번 나옵니다.");
          else if (vs[i].n < vs[i - 1].n) w.push("절 번호가 거꾸로 갑니다 (" + vs[i - 1].n + " 다음 " + vs[i].n + ").");
          else if (vs[i].n !== vs[i - 1].n + 1) w.push(vs[i - 1].n + "절 다음이 " + vs[i].n + "절입니다.");
        }
      }
    }
    var seen = {}, out = [];
    for (var k = 0; k < w.length; k++) if (!seen[w[k]]) { seen[w[k]] = 1; out.push(w[k]); }
    return out.slice(0, 8);
  };

  /** 미리보기에서 고친 결과를 저장용 배열로. 빠진 절은 빈 문자열로 메운다. */
  PS.toVerseArray = function (verses) {
    var max = 0, i;
    for (i = 0; i < verses.length; i++) max = Math.max(max, verses[i].n);
    var arr = [];
    for (i = 0; i < max; i++) arr.push("");
    for (i = 0; i < verses.length; i++) arr[verses[i].n - 1] = verses[i].t;
    return arr;
  };

  PS.ENDING = ENDING;

  global.PS = PS;
})(window);
