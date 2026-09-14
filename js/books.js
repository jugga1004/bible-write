(function (global) {
  "use strict";

  // ---------------------------------------------------------------------
  // 66권 메타데이터 — 로직 없는 순수 데이터 (heart-translator/lexicon.js와 같은 역할)
  // ---------------------------------------------------------------------
  // 여기 담긴 건 책 이름·약어·장 수뿐이다. 이 셋은 사실 정보라 어느 번역본을 쓰든
  // 같고, 본문 저작권과도 무관하다.
  //
  // **절 수는 일부러 넣지 않는다.** 번역본마다 절을 합치거나 나누는 곳이 있고
  // (시편 표제어가 대표적) 시 편마다 다르다. 절 수를 박아두면 사용자가 들여온
  // 본문과 어긋나 "37절인데 36절이라고 나온다"가 된다. 절 수는 본문에서 센다.
  //
  // c: 코드(파일명·키에 쓰는 3글자)  k: 이름  a: 약어  t: o(구약)/n(신약)  ch: 장 수

  var BK = {};

  BK.BOOKS = [
    { c: "GEN", k: "창세기", a: "창", t: "o", ch: 50 },
    { c: "EXO", k: "출애굽기", a: "출", t: "o", ch: 40 },
    { c: "LEV", k: "레위기", a: "레", t: "o", ch: 27 },
    { c: "NUM", k: "민수기", a: "민", t: "o", ch: 36 },
    { c: "DEU", k: "신명기", a: "신", t: "o", ch: 34 },
    { c: "JOS", k: "여호수아", a: "수", t: "o", ch: 24 },
    { c: "JDG", k: "사사기", a: "삿", t: "o", ch: 21 },
    { c: "RUT", k: "룻기", a: "룻", t: "o", ch: 4 },
    { c: "1SA", k: "사무엘상", a: "삼상", t: "o", ch: 31 },
    { c: "2SA", k: "사무엘하", a: "삼하", t: "o", ch: 24 },
    { c: "1KI", k: "열왕기상", a: "왕상", t: "o", ch: 22 },
    { c: "2KI", k: "열왕기하", a: "왕하", t: "o", ch: 25 },
    { c: "1CH", k: "역대상", a: "대상", t: "o", ch: 29 },
    { c: "2CH", k: "역대하", a: "대하", t: "o", ch: 36 },
    { c: "EZR", k: "에스라", a: "스", t: "o", ch: 10 },
    { c: "NEH", k: "느헤미야", a: "느", t: "o", ch: 13 },
    { c: "EST", k: "에스더", a: "에", t: "o", ch: 10 },
    { c: "JOB", k: "욥기", a: "욥", t: "o", ch: 42 },
    { c: "PSA", k: "시편", a: "시", t: "o", ch: 150 },
    { c: "PRO", k: "잠언", a: "잠", t: "o", ch: 31 },
    { c: "ECC", k: "전도서", a: "전", t: "o", ch: 12 },
    { c: "SNG", k: "아가", a: "아", t: "o", ch: 8 },
    { c: "ISA", k: "이사야", a: "사", t: "o", ch: 66 },
    { c: "JER", k: "예레미야", a: "렘", t: "o", ch: 52 },
    { c: "LAM", k: "예레미야애가", a: "애", t: "o", ch: 5 },
    { c: "EZK", k: "에스겔", a: "겔", t: "o", ch: 48 },
    { c: "DAN", k: "다니엘", a: "단", t: "o", ch: 12 },
    { c: "HOS", k: "호세아", a: "호", t: "o", ch: 14 },
    { c: "JOL", k: "요엘", a: "욜", t: "o", ch: 3 },
    { c: "AMO", k: "아모스", a: "암", t: "o", ch: 9 },
    { c: "OBA", k: "오바댜", a: "옵", t: "o", ch: 1 },
    { c: "JON", k: "요나", a: "욘", t: "o", ch: 4 },
    { c: "MIC", k: "미가", a: "미", t: "o", ch: 7 },
    { c: "NAM", k: "나훔", a: "나", t: "o", ch: 3 },
    { c: "HAB", k: "하박국", a: "합", t: "o", ch: 3 },
    { c: "ZEP", k: "스바냐", a: "습", t: "o", ch: 3 },
    { c: "HAG", k: "학개", a: "학", t: "o", ch: 2 },
    { c: "ZEC", k: "스가랴", a: "슥", t: "o", ch: 14 },
    { c: "MAL", k: "말라기", a: "말", t: "o", ch: 4 },

    { c: "MAT", k: "마태복음", a: "마", t: "n", ch: 28 },
    { c: "MRK", k: "마가복음", a: "막", t: "n", ch: 16 },
    { c: "LUK", k: "누가복음", a: "눅", t: "n", ch: 24 },
    { c: "JHN", k: "요한복음", a: "요", t: "n", ch: 21 },
    { c: "ACT", k: "사도행전", a: "행", t: "n", ch: 28 },
    { c: "ROM", k: "로마서", a: "롬", t: "n", ch: 16 },
    { c: "1CO", k: "고린도전서", a: "고전", t: "n", ch: 16 },
    { c: "2CO", k: "고린도후서", a: "고후", t: "n", ch: 13 },
    { c: "GAL", k: "갈라디아서", a: "갈", t: "n", ch: 6 },
    { c: "EPH", k: "에베소서", a: "엡", t: "n", ch: 6 },
    { c: "PHP", k: "빌립보서", a: "빌", t: "n", ch: 4 },
    { c: "COL", k: "골로새서", a: "골", t: "n", ch: 4 },
    { c: "1TH", k: "데살로니가전서", a: "살전", t: "n", ch: 5 },
    { c: "2TH", k: "데살로니가후서", a: "살후", t: "n", ch: 3 },
    { c: "1TI", k: "디모데전서", a: "딤전", t: "n", ch: 6 },
    { c: "2TI", k: "디모데후서", a: "딤후", t: "n", ch: 4 },
    { c: "TIT", k: "디도서", a: "딛", t: "n", ch: 3 },
    { c: "PHM", k: "빌레몬서", a: "몬", t: "n", ch: 1 },
    { c: "HEB", k: "히브리서", a: "히", t: "n", ch: 13 },
    { c: "JAS", k: "야고보서", a: "약", t: "n", ch: 5 },
    { c: "1PE", k: "베드로전서", a: "벧전", t: "n", ch: 5 },
    { c: "2PE", k: "베드로후서", a: "벧후", t: "n", ch: 3 },
    { c: "1JN", k: "요한일서", a: "요일", t: "n", ch: 5 },
    { c: "2JN", k: "요한이서", a: "요이", t: "n", ch: 1 },
    { c: "3JN", k: "요한삼서", a: "요삼", t: "n", ch: 1 },
    { c: "JUD", k: "유다서", a: "유", t: "n", ch: 1 },
    { c: "REV", k: "요한계시록", a: "계", t: "n", ch: 22 }
  ];

  var byCode = {};
  var nameIndex = {};

  // 이름으로 찾을 때 공백과 마침표는 무시한다. 사이트마다 "요한 복음", "요한복음",
  // "요일." 처럼 제각각으로 적어 오기 때문이다.
  function key(s) { return String(s || "").replace(/[\s.]/g, ""); }

  (function () {
    for (var i = 0; i < BK.BOOKS.length; i++) {
      var b = BK.BOOKS[i];
      b.i = i;
      byCode[b.c] = b;
      nameIndex[key(b.k)] = b.c;
      nameIndex[key(b.a)] = b.c;
      nameIndex[b.c] = b.c;
    }
    // 흔히 쓰이는 다른 표기
    var ALIAS = {
      "아가서": "SNG", "애가": "LAM", "예레미야 애가": "LAM", "전도": "ECC",
      "시": "PSA", "시편기": "PSA", "계시록": "REV", "행전": "ACT",
      "삼상": "1SA", "삼하": "2SA", "왕상": "1KI", "왕하": "2KI",
      "대상": "1CH", "대하": "2CH", "고린도전": "1CO", "고린도후": "2CO"
    };
    for (var a in ALIAS) if (ALIAS.hasOwnProperty(a)) nameIndex[key(a)] = ALIAS[a];
  })();

  BK.byCode = function (code) { return byCode[String(code || "").toUpperCase()] || null; };
  BK.byName = function (name) { return byCode[nameIndex[key(name)]] || null; };
  BK.chapterCount = function (code) { var b = BK.byCode(code); return b ? b.ch : 0; };
  BK.totalChapters = function () {
    var n = 0;
    for (var i = 0; i < BK.BOOKS.length; i++) n += BK.BOOKS[i].ch;
    return n;
  };

  /** "GEN" + 1 -> "GEN.001" — 사전순이 곧 장 순서가 되도록 자릿수를 맞춘다. */
  BK.chapterKey = function (code, ch) {
    var s = String(ch);
    while (s.length < 3) s = "0" + s;
    return String(code).toUpperCase() + "." + s;
  };

  BK.label = function (code, ch, v) {
    var b = BK.byCode(code);
    if (!b) return "";
    var s = b.k + (ch ? " " + ch + "장" : "");
    return v ? s + " " + v + "절" : s;
  };

  BK.NAME_INDEX = nameIndex;

  global.BK = BK;
})(window);
