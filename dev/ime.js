(function (global) {
  "use strict";

  // ---------------------------------------------------------------------
  // 두벌식 IME 시늉내기 — 테스트 전용. 배포 파일이 아니다.
  // ---------------------------------------------------------------------
  // 판정 엔진을 손으로 쳐 가며 확인하면 회귀를 잡을 수 없다. 그래서 목표 문장을
  // 자모로 풀어 한 타씩 먹이면서, 매 타마다 (입력창 value, 조합 구간)을 만들어낸다.
  // 관건은 **받침 넘김**이다. "가나"를 칠 때 ㄴ은 일단 "간"의 받침이 되었다가
  // 다음 모음 ㅏ에서 떨어져 나와 "나"의 초성이 된다. 실제 IME가 그렇게 동작한다.

  var IME = {};

  var CHO = HG.CHO, JUNG = HG.JUNG, JONG = HG.JONG;

  var JOIN_JONG = {
    "ㄱㅅ": "ㄳ", "ㄴㅈ": "ㄵ", "ㄴㅎ": "ㄶ",
    "ㄹㄱ": "ㄺ", "ㄹㅁ": "ㄻ", "ㄹㅂ": "ㄼ", "ㄹㅅ": "ㄽ", "ㄹㅌ": "ㄾ", "ㄹㅍ": "ㄿ", "ㄹㅎ": "ㅀ",
    "ㅂㅅ": "ㅄ"
  };
  var SPLIT_JONG = {
    "ㄳ": "ㄱㅅ", "ㄵ": "ㄴㅈ", "ㄶ": "ㄴㅎ",
    "ㄺ": "ㄹㄱ", "ㄻ": "ㄹㅁ", "ㄼ": "ㄹㅂ", "ㄽ": "ㄹㅅ", "ㄾ": "ㄹㅌ", "ㄿ": "ㄹㅍ", "ㅀ": "ㄹㅎ",
    "ㅄ": "ㅂㅅ"
  };
  var JOIN_JUNG = {
    "ㅗㅏ": "ㅘ", "ㅗㅐ": "ㅙ", "ㅗㅣ": "ㅚ",
    "ㅜㅓ": "ㅝ", "ㅜㅔ": "ㅞ", "ㅜㅣ": "ㅟ",
    "ㅡㅣ": "ㅢ"
  };

  function isVowel(j) { return JUNG.indexOf(j) >= 0; }
  function canBeJong(j) { return JONG.indexOf(j) > 0; }

  /**
   * 문자열을 "한 타씩" 친 결과를 단계별로 돌려준다.
   * @returns [{value, compStart, compEnd, key}]
   */
  IME.typeOut = function (text) {
    var steps = [];
    var committed = "";
    var buf = null; // {cho, jung, jong}

    function render() {
      if (!buf) return "";
      if (buf.cho && buf.jung) return HG.compose(buf.cho, buf.jung, buf.jong || "");
      if (buf.cho) return buf.cho;
      if (buf.jung) return buf.jung;
      return "";
    }
    function flush() {
      committed += render();
      buf = null;
    }
    function emit(key) {
      var frag = render();
      steps.push({
        key: key,
        value: committed + frag,
        compStart: committed.length,
        compEnd: committed.length + frag.length
      });
    }

    var seq = [];
    for (var i = 0; i < text.length; i++) {
      var ch = text.charAt(i);
      var part = HG.toJamoSeq(ch);
      for (var k = 0; k < part.length; k++) seq.push(part[k]);
    }

    for (var s = 0; s < seq.length; s++) {
      var j = seq[s];

      if (!HG.isCompatJamo(j)) {       // 공백·문장부호: 조합을 끊고 그대로 확정
        flush();
        committed += j;
        steps.push({ key: j, value: committed, compStart: committed.length, compEnd: committed.length });
        continue;
      }

      if (isVowel(j)) {
        if (buf && buf.jong) {
          // 받침이 다음 글자의 초성으로 떨어져 나간다 — 여기가 핵심 구간
          var jong = buf.jong;
          var split = SPLIT_JONG[jong];
          if (split) { buf.jong = split.charAt(0); flush(); buf = { cho: split.charAt(1), jung: j, jong: "" }; }
          else { buf.jong = ""; flush(); buf = { cho: jong, jung: j, jong: "" }; }
        } else if (buf && buf.cho && !buf.jung) {
          buf.jung = j;
        } else if (buf && buf.jung && JOIN_JUNG[buf.jung + j]) {
          buf.jung = JOIN_JUNG[buf.jung + j];
        } else {
          flush();
          buf = { cho: "", jung: j, jong: "" };
        }
      } else {
        if (!buf) {
          buf = { cho: j, jung: "", jong: "" };
        } else if (buf.cho && !buf.jung) {
          flush(); buf = { cho: j, jung: "", jong: "" };
        } else if (buf.jung && !buf.jong && canBeJong(j)) {
          buf.jong = j;
        } else if (buf.jong && JOIN_JONG[buf.jong + j]) {
          buf.jong = JOIN_JONG[buf.jong + j];
        } else {
          flush(); buf = { cho: j, jung: "", jong: "" };
        }
      }
      emit(j);
    }

    // 마지막 조합은 사용자가 확정(스페이스/엔터/포커스 이동)한 것으로 본다
    if (buf) {
      flush();
      steps.push({ key: "(확정)", value: committed, compStart: committed.length, compEnd: committed.length });
    }
    return steps;
  };

  global.IME = IME;
})(window);
