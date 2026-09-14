(function (global) {
  "use strict";

  // ---------------------------------------------------------------------
  // 판정 엔진 — DOM을 모른다. 그래서 dev/ 페이지에서 따로 시험할 수 있다.
  // ---------------------------------------------------------------------
  // 규칙은 두 줄이다.
  //   1) 확정된 글자는 음절 하나하나를 그대로 비교한다.
  //   2) 조합 중인 글자만 자모 접두사로 비교하고, 원문을 2글자 더 내다본다.
  //
  // (2)의 "2글자 더"가 이 엔진의 심장이다. 원문이 "가나"일 때 사용자가
  // ㄱ ㅏ ㄴ 을 치면 IME는 "간"을 만든다 — 다음 글자의 초성이 앞 글자의 받침으로
  // 붙기 때문이다. 원문 한 글자("가")와만 견주면 "간"은 접두사가 아니라서
  // 오타로 뜨고, 화면은 정상 타이핑 내내 빨갛게 깜빡인다.
  // "가나"와 견주면 ㄱㅏㄴ 은 ㄱㅏㄴㅏ 의 접두사라 조용히 넘어간다.

  var TY = {};

  var IDLE_MS = 10000; // 이 이상 손이 멈추면 시간 계산에서 뺀다 (묵상하다 쉬는 시간)

  TY.createSession = function (targetText, opts) {
    opts = opts || {};
    var lookahead = opts.lookahead == null ? 2 : opts.lookahead;

    var target = NM.normalize(String(targetText || ""));
    var tChars = target.chars;

    var prevStates = [];
    var errorEvents = 0;
    var typedJamo = 0;
    var startedAt = 0, lastInputAt = 0, elapsed = 0;

    var session = {};

    session.targetNorm = target;

    /**
     * @param raw    입력창의 value 그대로
     * @param pStart 조합 중인 구간의 시작(원본 인덱스). 조합 중이 아니면 raw.length
     * @param pEnd   조합 중인 구간의 끝(원본 인덱스)
     */
    session.update = function (raw, pStart, pEnd) {
      raw = String(raw == null ? "" : raw);
      if (pStart == null) pStart = raw.length;
      if (pEnd == null) pEnd = raw.length;

      var typed = NM.normalize(raw);
      var tp = typed.chars;

      var ns = NM.toNormIndex(typed, pStart, raw.length);
      var ne = NM.toNormIndex(typed, pEnd, raw.length);
      if (ne < ns) ne = ns;

      var states = new Array(tp.length);
      var i;

      for (i = 0; i < tp.length; i++) {
        if (i >= ns && i < ne) continue; // 조합 구간은 아래에서 통째로 판정
        if (i >= tChars.length) states[i] = "extra";
        else states[i] = tp[i] === tChars[i] ? "ok" : "err";
      }

      if (ne > ns) {
        var tail = tp.slice(ns, ne).join("");
        var ahead = tChars.slice(ns, ne + lookahead).join("");
        var pending = ahead.length > 0 && HG.isJamoPrefix(tail, ahead);
        for (i = ns; i < ne; i++) states[i] = pending ? "pending" : (i >= tChars.length ? "extra" : "err");
      }

      // 오타는 "머무는 동안"이 아니라 "틀리게 된 순간"에만 센다.
      // 조합 중(pending)은 절대 오타가 아니다 — IME 때문에 생기는 중간 상태일 뿐이다.
      //
      // 그리고 **지금 치고 있는 자리는 세지 않는다.** 맨 끝 글자는 조합이 들락거리는
      // 자리라 한 음절을 치는 동안에도 판정이 여러 번 뒤집힌다. 거기서 세면 정상적으로
      // 쳐도 오타가 수십 번 쌓인다. 사람 기준으로도 아직 치는 중인 글자는 오타가
      // 아니라 고쳐 쓰는 중이다. **지나쳐 버린 자리**만 오타로 본다.
      var settled = tp.length - 1;

      // 아직 치고 있는 자리는 "틀렸다"로 **기억해 두지도** 않는다. 기억해 두면
      // 나중에 그 자리를 지나칠 때 "이미 틀려 있었다"가 되어 한 번도 세지 못한다.
      var mark = states.slice();
      for (i = settled < 0 ? 0 : settled; i < mark.length; i++) {
        if (mark[i] === "err" || mark[i] === "extra") mark[i] = "pending";
      }

      for (i = 0; i < settled; i++) {
        var was = prevStates[i];
        var now = states[i];
        if ((now === "err" || now === "extra") && was !== "err" && was !== "extra") errorEvents++;
      }
      prevStates = mark;
      typedJamo = HG.jamoCount(typed.text);

      tick(tp.length > 0);

      return {
        states: spread(states, typed, raw.length),
        targetStates: targetStates(states, tp.length),
        typedLength: tp.length,
        done: typed.text === target.text && target.text.length > 0,
        composing: ne > ns
      };
    };

    // 정규화 인덱스의 판정 결과를 원본 글자 자리로 되돌린다.
    // 접혀서 사라진 글자(연속 공백의 두 번째 등)는 앞 글자의 상태를 물려받는다.
    function spread(states, typed, rawLen) {
      var out = new Array(rawLen);
      for (var j = 0; j < rawLen; j++) {
        var o = typed.owner[j];
        out[j] = o == null || o < 0 ? "ok" : (states[o] || "ok");
      }
      return out;
    }

    // 원문 쪽 표시용. 아직 안 친 글자는 "todo".
    function targetStates(states, typedLen) {
      var out = new Array(target.owner.length);
      for (var j = 0; j < target.owner.length; j++) {
        var o = target.owner[j];
        if (o == null || o < 0) { out[j] = "ok"; continue; }
        out[j] = o < typedLen ? (states[o] === "extra" ? "err" : states[o]) : "todo";
      }
      return out;
    }

    function tick(hasInput) {
      var now = Date.now();
      if (!hasInput) { lastInputAt = now; return; }
      if (!startedAt) { startedAt = now; lastInputAt = now; return; }
      var gap = now - lastInputAt;
      if (gap < IDLE_MS) elapsed += gap;
      lastInputAt = now;
    }

    /**
     * 타속은 **지금까지 친 만큼**을 지금까지 걸린 시간으로 나눈다.
     * 절 전체 글자 수를 분자에 쓰면, 앞부분만 쳤을 때 실제의 몇 배가 나온다
     * (절을 다 치고 나면 둘은 같은 값이 된다).
     */
    session.stats = function () {
      var jamo = HG.jamoCount(target.text);
      var min = elapsed / 60000;
      var counted = typedJamo || 0;
      return {
        jamo: jamo,                 // 이 절의 분량 (기록에 남길 값)
        typedJamo: counted,
        ms: elapsed,
        cpm: min > 0.0005 ? Math.round(counted / min) : 0,
        errorEvents: errorEvents,
        accuracy: counted > 0 ? Math.max(0, 1 - errorEvents / counted) : 1
      };
    };

    session.reset = function () {
      prevStates = [];
      errorEvents = 0;
      typedJamo = 0;
      startedAt = 0; lastInputAt = 0; elapsed = 0;
    };

    return session;
  };

  TY.IDLE_MS = IDLE_MS;

  global.TY = TY;
})(window);
