(function (global) {
  "use strict";

  // ---------------------------------------------------------------------
  // 필사 입력 위젯 — textarea 뒤에 같은 글꼴의 레이어를 깔고 거기에 색을 칠한다.
  // ---------------------------------------------------------------------
  // textarea 안의 글자 하나만 빨갛게 칠할 방법은 없다. contenteditable이면
  // 가능하지만, 글자마다 색을 다시 칠한다는 건 매 입력마다 DOM을 새로 만든다는
  // 뜻이고 **그게 바로 한글 조합을 깨뜨리는 동작**이다. 조합 중에 DOM을 건드리면
  // 커서가 튀고 글자가 사라진다.
  //
  // 그래서 입력은 textarea에 맡기고(캐럿·선택·IME 후보창 전부 네이티브),
  // 글자는 뒤에 깔린 레이어가 그린다. textarea 글자는 투명하게 만든다.
  // 두 요소의 글꼴·크기·줄간격·여백이 1px이라도 어긋나면 글자가 밀리므로
  // style.css에서 한 규칙으로 묶어 선언한다.

  var EDT = {};

  EDT.create = function (opts) {
    var input = opts.input;       // textarea
    var layer = opts.layer;       // 뒤에 깔리는 div
    var source = opts.source;     // 원문을 보여줄 div
    var onDone = opts.onDone || function () {};
    var onChange = opts.onChange || function () {};

    var session = null;
    var targetRaw = "";
    var composing = false;
    var compData = "";
    var doneTimer = null;
    var finished = false;

    // ------------------------------------------------------------- 그리기

    function paint(chars, states, into) {
      var frag = document.createDocumentFragment();
      var i = 0;
      while (i < chars.length) {
        var st = states[i] || "ok";
        var j = i;
        while (j < chars.length && (states[j] || "ok") === st) j++;
        var span = document.createElement("span");
        span.className = "ch ch--" + st;
        span.textContent = chars.slice(i, j);
        frag.appendChild(span);
        i = j;
      }
      // 마지막 줄이 비면 레이어 높이가 한 줄 모자라 스크롤이 어긋난다
      frag.appendChild(document.createTextNode("​"));
      into.innerHTML = "";
      into.appendChild(frag);
    }

    function sync() {
      layer.scrollTop = input.scrollTop;
      layer.scrollLeft = input.scrollLeft;
    }

    // ------------------------------------------------------------- 판정

    function pendingRange() {
      if (!composing) return [input.value.length, input.value.length];
      // 조합 중인 글자 수는 compositionupdate가 알려준다. 안드로이드 일부 키보드는
      // 이걸 주지 않으므로 최소 1글자로 본다. 꼬리가 아니라 **캐럿 기준**이다 —
      // 사용자가 중간을 고치려고 커서를 옮겨 조합할 수 있다.
      var len = Math.max(1, (compData || "").length);
      var end = input.selectionStart;
      if (end == null || end < 0) end = input.value.length;
      return [Math.max(0, end - len), end];
    }

    function evaluate() {
      if (!session) return;
      var raw = input.value;
      var pr = pendingRange();
      var r = session.update(raw, pr[0], pr[1]);

      paint(raw, r.states, layer);
      paint(targetRaw, r.targetStates, source);
      sync();

      onChange(r, session);

      if (r.done && !finished) scheduleDone(r);
      else if (!r.done && doneTimer) { clearTimeout(doneTimer); doneTimer = null; }
    }

    // 다 맞았다고 곧바로 넘기지 않는다. 조합이 살아 있는 채로 화면을 바꾸면
    // 그 조합이 다음 절 입력창으로 흘러 들어간다. 250ms는 "손이 멈췄다"를
    // 확인하기에 충분하고 사람이 답답해하지 않는 길이다.
    function scheduleDone(r) {
      if (doneTimer) clearTimeout(doneTimer);
      doneTimer = setTimeout(function () {
        doneTimer = null;
        if (finished) return;
        finished = true;
        onDone(input.value, session.stats(), r);
      }, 250);
    }

    // ------------------------------------------------------------- 이벤트

    input.addEventListener("compositionstart", function () {
      composing = true;
      compData = "";
    });
    input.addEventListener("compositionupdate", function (e) {
      compData = e.data || "";
    });
    input.addEventListener("compositionend", function () {
      composing = false;
      compData = "";
      // 사파리·iOS는 이 시점에 value가 아직 갱신되지 않았을 수 있다.
      setTimeout(evaluate, 0);
    });
    input.addEventListener("input", function (e) {
      if (typeof e.isComposing === "boolean") composing = e.isComposing;
      evaluate();
    });
    input.addEventListener("scroll", sync);
    // 조합 중에 탭을 옮기면 compositionend가 오지 않는다. 그대로 두면 마지막
    // 글자가 영원히 "조합 중"으로 굳어 절이 끝나지 않는다.
    input.addEventListener("blur", function () {
      composing = false;
      compData = "";
      evaluate();
    });
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        e.preventDefault();               // 줄바꿈은 필요 없다 — 한 번에 한 절이다
        if (composing) return;
        if (opts.onEnter) opts.onEnter(input.value, session ? session.stats() : null);
      }
      if (e.key === "Tab" && opts.onSkip) { e.preventDefault(); opts.onSkip(); }
    });

    // ------------------------------------------------------------- 공개 API

    var api = {};

    api.setVerse = function (text, draft) {
      targetRaw = String(text || "");
      session = TY.createSession(targetRaw);
      finished = false;
      if (doneTimer) { clearTimeout(doneTimer); doneTimer = null; }

      // 조합이 살아 있는 채로 value를 갈면 IME 내부 상태가 남아 다음 입력이
      // 뒤엉킨다. blur -> 비우기 -> focus 가 조합을 확실히 끊는 방법이다.
      input.blur();
      input.value = draft || "";
      paint(targetRaw, mapStates(targetRaw.length, "todo"), source);
      paint(input.value, mapStates(input.value.length, "ok"), layer);
      evaluate();
    };

    api.focus = function () {
      try { input.focus(); } catch (e) { /* 모바일에서 막힐 수 있다 */ }
    };

    api.value = function () { return input.value; };
    api.stats = function () { return session ? session.stats() : null; };
    api.target = function () { return targetRaw; };
    api.refresh = function () { evaluate(); };

    function mapStates(n, s) {
      var out = [];
      for (var i = 0; i < n; i++) out.push(s);
      return out;
    }

    return api;
  };

  global.EDT = EDT;
})(window);
