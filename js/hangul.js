(function (global) {
  "use strict";

  // ---------------------------------------------------------------------
  // 한글 자모 — 이 앱에서 가장 아래에 깔리는 층.
  // ---------------------------------------------------------------------
  // 여기가 틀리면 판정 엔진 전체가 틀린다. 핵심은 하나다:
  //
  //   "타이핑 도중의 모든 중간 상태는, 목표 글자의 '자모 접두사'다."
  //
  // 한(ㅎ→하→한), 값(ㄱ→가→갑→값), 화(ㅎ→호→화) 전부 그렇다.
  // 그래서 접두사인지만 물어보면 "아직 치는 중"과 "틀렸다"를 가를 수 있다.
  //
  // 자모의 표기는 **호환 자모**(U+3131~, 키보드에서 ㄱ만 눌렀을 때 IME가 주는 그것)로
  // 통일한다. 음절을 분해하면 초성 U+1100 계열이 나오지만 그걸 그대로 쓰면
  // "ㅎ"(U+314E) 한 타를 친 순간 초성 ㅎ(U+1112)과 달라서 **무조건 오타**가 뜬다.
  // 이 한 줄 때문에 앱 전체가 빨갛게 되므로 반드시 호환 자모로 맞춘다.

  var HG = {};

  var BASE = 0xac00;
  var LAST = 0xd7a3;

  // 초성 19 / 중성 21 / 종성 28(0번은 받침 없음) — 전부 호환 자모 표기
  var CHO = ["ㄱ","ㄲ","ㄴ","ㄷ","ㄸ","ㄹ","ㅁ","ㅂ","ㅃ","ㅅ","ㅆ","ㅇ","ㅈ","ㅉ","ㅊ","ㅋ","ㅌ","ㅍ","ㅎ"];
  var JUNG = ["ㅏ","ㅐ","ㅑ","ㅒ","ㅓ","ㅔ","ㅕ","ㅖ","ㅗ","ㅘ","ㅙ","ㅚ","ㅛ","ㅜ","ㅝ","ㅞ","ㅟ","ㅠ","ㅡ","ㅢ","ㅣ"];
  var JONG = ["","ㄱ","ㄲ","ㄳ","ㄴ","ㄵ","ㄶ","ㄷ","ㄹ","ㄺ","ㄻ","ㄼ","ㄽ","ㄾ","ㄿ","ㅀ","ㅁ","ㅂ","ㅄ","ㅅ","ㅆ","ㅇ","ㅈ","ㅊ","ㅋ","ㅌ","ㅍ","ㅎ"];

  // 겹받침 11종 — "값"을 치려면 반드시 "갑"을 거친다.
  var SPLIT_JONG = {
    "ㄳ": "ㄱㅅ", "ㄵ": "ㄴㅈ", "ㄶ": "ㄴㅎ",
    "ㄺ": "ㄹㄱ", "ㄻ": "ㄹㅁ", "ㄼ": "ㄹㅂ", "ㄽ": "ㄹㅅ", "ㄾ": "ㄹㅌ", "ㄿ": "ㄹㅍ", "ㅀ": "ㄹㅎ",
    "ㅄ": "ㅂㅅ"
  };

  // 겹모음 7종 — "화"를 치려면 반드시 "호"를 거친다.
  // ㅙ는 ㅗ+ㅐ로 나눈다(ㅐ는 키보드에서 한 타라 더 쪼개지 않는다).
  var SPLIT_JUNG = {
    "ㅘ": "ㅗㅏ", "ㅙ": "ㅗㅐ", "ㅚ": "ㅗㅣ",
    "ㅝ": "ㅜㅓ", "ㅞ": "ㅜㅔ", "ㅟ": "ㅜㅣ",
    "ㅢ": "ㅡㅣ"
  };

  // 음절 분해 중 나올 수 있는 U+1100 계열을 호환 자모로 되돌리는 표.
  // (외부에서 NFD로 정규화된 문자열이 들어오는 경우 대비 — macOS Safari)
  var COMPAT_FROM_CHO = {};
  var COMPAT_FROM_JUNG = {};
  var COMPAT_FROM_JONG = {};
  (function () {
    var i;
    for (i = 0; i < CHO.length; i++) COMPAT_FROM_CHO[String.fromCharCode(0x1100 + i)] = CHO[i];
    for (i = 0; i < JUNG.length; i++) COMPAT_FROM_JUNG[String.fromCharCode(0x1161 + i)] = JUNG[i];
    for (i = 1; i < JONG.length; i++) COMPAT_FROM_JONG[String.fromCharCode(0x11a7 + i)] = JONG[i];
  })();

  HG.isSyllable = function (ch) {
    if (!ch) return false;
    var c = ch.charCodeAt(0);
    return c >= BASE && c <= LAST;
  };

  // 호환 자모 영역(U+3131~U+3163). 옛한글(U+3164~318E)은 성경 본문에 안 나오므로 제외.
  HG.isCompatJamo = function (ch) {
    if (!ch) return false;
    var c = ch.charCodeAt(0);
    return c >= 0x3131 && c <= 0x3163;
  };

  HG.isJamo = function (ch) {
    if (!ch) return false;
    var c = ch.charCodeAt(0);
    if (HG.isCompatJamo(ch)) return true;
    return c >= 0x1100 && c <= 0x11ff; // 분리된 초/중/종성
  };

  // 음절 -> [초성, 중성, 종성] (호환 자모, 받침 없으면 종성은 "")
  HG.decompose = function (ch) {
    if (!HG.isSyllable(ch)) return null;
    var n = ch.charCodeAt(0) - BASE;
    return [CHO[Math.floor(n / 588)], JUNG[Math.floor((n % 588) / 28)], JONG[n % 28]];
  };

  HG.compose = function (cho, jung, jong) {
    var a = CHO.indexOf(cho), b = JUNG.indexOf(jung), c = JONG.indexOf(jong || "");
    if (a < 0 || b < 0 || c < 0) return null;
    return String.fromCharCode(BASE + (a * 21 + b) * 28 + c);
  };

  // 글자 하나 -> 원자 자모 배열.
  // 한글이 아니면 글자 자체를 한 칸으로 돌려준다(공백·문장부호도 한 타로 센다).
  HG.toJamoSeq = function (ch) {
    var out = [];
    var d = HG.decompose(ch);
    if (d) {
      out.push(d[0]);
      push(out, SPLIT_JUNG[d[1]] || d[1]);
      if (d[2]) push(out, SPLIT_JONG[d[2]] || d[2]);
      return out;
    }
    // 낱자로 들어온 경우: 호환 자모로 맞춘 뒤 겹자모면 쪼갠다
    var j = COMPAT_FROM_CHO[ch] || COMPAT_FROM_JUNG[ch] || COMPAT_FROM_JONG[ch] || ch;
    push(out, SPLIT_JUNG[j] || SPLIT_JONG[j] || j);
    return out;
  };

  function push(arr, s) {
    for (var i = 0; i < s.length; i++) arr.push(s.charAt(i));
  }

  HG.seqOf = function (str) {
    var out = [];
    for (var i = 0; i < str.length; i++) {
      var part = HG.toJamoSeq(str.charAt(i));
      for (var k = 0; k < part.length; k++) out.push(part[k]);
    }
    return out;
  };

  // 타수 계산용. 한컴 타자연습과 같은 정의(자모 하나 = 1타, Shift는 안 셈).
  HG.jamoCount = function (str) {
    return HG.seqOf(str).length;
  };

  // typed가 target을 치는 도중의 상태인가?
  // 빈 문자열은 언제나 접두사다(아직 아무것도 안 침).
  HG.isJamoPrefix = function (typed, target) {
    if (!typed) return true;
    var a = HG.seqOf(typed), b = HG.seqOf(target);
    if (a.length > b.length) return false;
    for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  };

  HG.CHO = CHO;
  HG.JUNG = JUNG;
  HG.JONG = JONG;

  global.HG = HG;
})(window);
