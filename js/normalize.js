(function (global) {
  "use strict";

  // ---------------------------------------------------------------------
  // 정규화 — 판정만 관대하게, 화면은 원문 그대로.
  // ---------------------------------------------------------------------
  // 성경 본문에는 둥근따옴표·전각공백·줄바꿈이 섞여 들어온다. 사용자가 키보드로
  // 그걸 똑같이 재현할 방법은 없다(키보드에 “ 가 없다). 그래서 비교 전에
  // 양쪽을 평평하게 만든다.
  //
  // 다만 **화면에는 성경 원문을 그대로 보여줘야 한다.** 둥근따옴표를 직선으로
  // 바꿔서 보여주면 그건 이미 그 성경이 아니다. 그래서 정규화 결과에
  // "이 글자는 원본 몇 번째에서 왔는가"(map)와 그 역(owner)을 같이 들고 다닌다.
  // 판정은 정규화된 문자열로 하고, 색칠은 owner로 원본 위치를 찾아서 한다.

  var NM = {};

  // 길이가 변하지 않는 1:1 치환. 인덱스가 흔들리지 않으므로 안전하다.
  var CHAR_MAP = {
    "\u201C": '"', "\u201D": '"', "\u201E": '"', "\u2033": '"', "\u301D": '"', "\u301E": '"',
    "\u2018": "'", "\u2019": "'", "\u201A": "'", "\u2032": "'", "\u0060": "'", "\u00B4": "'",
    "\u2010": "-", "\u2011": "-", "\u2012": "-", "\u2013": "-", "\u2014": "-", "\u2015": "-", "\u2212": "-",
    "\u00A0": " ", "\u3000": " ", "\t": " ", "\n": " ", "\r": " ", "\u2028": " ", "\u2029": " "
  };

  // 아예 없는 셈 치는 글자들
  var DROP = { "\u200B": 1, "\u200C": 1, "\u200D": 1, "\uFEFF": 1, "\u00AD": 1 };

  // '…'와 '...'은 서로 바꾸지 않는다. 1:1이 아니라서 인덱스 매핑이 흔들리고,
  // 특수문자 한 종류 때문에 그 복잡도를 감수할 이유가 없다. 대신 본문을 들여올 때
  // normalizeSource()가 '...'를 '…'로 통일해 둔다.

  function mapChar(ch) {
    if (CHAR_MAP[ch]) return CHAR_MAP[ch];
    var c = ch.charCodeAt(0);
    // 전각 영숫자·문장부호 -> 반각
    if (c >= 0xff01 && c <= 0xff5e) return String.fromCharCode(c - 0xfee0);
    return ch;
  }

  /**
   * 판정용 정규화.
   * @returns {{text:string, chars:string[], map:number[], owner:number[]}}
   *   map[i]   = 정규화 i번째 글자가 원본의 몇 번째에서 왔는가
   *   owner[j] = 원본 j번째 글자가 정규화 몇 번째에 속하는가 (접혀 사라졌으면 앞 글자,
   *              앞이 없으면 -1 = 판정 대상 아님)
   */
  NM.normalize = function (raw, opts) {
    opts = opts || {};
    var trimEnd = opts.trimEnd !== false;
    var chars = [], map = [], owner = new Array(raw.length);
    var i, ch, prevSpace = false;

    for (i = 0; i < raw.length; i++) {
      ch = raw.charAt(i);
      if (DROP[ch]) { owner[i] = chars.length - 1; continue; }
      ch = mapChar(ch);
      if (ch === " ") {
        // 연속 공백은 한 칸으로 접는다. 앞에 아무것도 없으면(문두) 통째로 버린다.
        if (prevSpace || chars.length === 0) { owner[i] = chars.length - 1; continue; }
        prevSpace = true;
      } else {
        prevSpace = false;
      }
      owner[i] = chars.length;
      map.push(i);
      chars.push(ch);
    }

    // 끝의 공백은 떼어낸다. 타이핑 중 마지막에 친 스페이스가 "남는 글자"로
    // 오판되면 안 된다 — 다음 단어를 치려고 누른 것뿐이다.
    if (trimEnd) {
      while (chars.length && chars[chars.length - 1] === " ") {
        var last = chars.length - 1;
        chars.pop(); map.pop();
        for (i = 0; i < owner.length; i++) if (owner[i] >= last) owner[i] = last - 1;
      }
    }

    return { text: chars.join(""), chars: chars, map: map, owner: owner };
  };

  /** 원본 인덱스 -> "그 위치 이후 첫 정규화 인덱스". 조합 구간 변환에 쓴다. */
  NM.toNormIndex = function (norm, rawIndex, rawLength) {
    if (rawIndex >= rawLength) return norm.chars.length;
    for (var j = rawIndex; j < norm.owner.length; j++) {
      // owner[j]가 j 자신을 담고 있는(= 살아남은) 첫 글자를 찾는다
      if (norm.map[norm.owner[j]] === j) return norm.owner[j];
    }
    return norm.chars.length;
  };

  /**
   * 본문을 들여올 때 한 번만 돌리는 파괴적 정리. 인덱스를 보존할 필요가 없다.
   * 저장되는 본문 자체를 깨끗하게 만들어 두면 필사 중 매번 할 일이 줄어든다.
   */
  NM.normalizeSource = function (raw) {
    var s = String(raw == null ? "" : raw);
    if (typeof s.normalize === "function") {
      try { s = s.normalize("NFC"); } catch (e) { /* 미지원 브라우저는 그냥 진행 */ }
    }
    s = s.replace(/\r\n?/g, "\n");
    var out = "";
    for (var i = 0; i < s.length; i++) {
      var ch = s.charAt(i);
      if (DROP[ch]) continue;
      if (ch === "\n") { out += "\n"; continue; }
      out += mapChar(ch);
    }
    out = out.replace(/\.{3,}/g, "\u2026");
    out = out.replace(/[ \t]+/g, " ");
    return out.replace(/^[ \t]+|[ \t]+$/g, "");
  };

  NM.CHAR_MAP = CHAR_MAP;

  global.NM = NM;
})(window);
