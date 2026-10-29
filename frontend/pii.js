/**
 * pii.js — 個資掃描（P4；純邏輯，可在 node 測試）
 * 找出可能的電話、Email、身分證字號、地址。只提醒、不阻擋；寧可多報，由擁有者判斷是不是誤報。
 * 掃描的是「訪客實際會看到的內文」（後端 previewNote 的結果），所以已轉成純文字的私人連結不會被掃進來。
 */
var VaultPii = (function () {
  'use strict';
  var K = function (s) {
    return s;
  }; // 翻譯鍵標記（掃描工具靠它找出鍵）
  var TYPES = {
    email: K('Email'),
    mobile: K('手機'),
    phone: K('市話'),
    id: K('身分證字號'),
    address: K('地址')
  };

  var LETTER = {
    A: 10,
    B: 11,
    C: 12,
    D: 13,
    E: 14,
    F: 15,
    G: 16,
    H: 17,
    I: 34,
    J: 18,
    K: 19,
    L: 20,
    M: 21,
    N: 22,
    O: 35,
    P: 23,
    Q: 24,
    R: 25,
    S: 26,
    T: 27,
    U: 28,
    V: 29,
    W: 32,
    X: 30,
    Y: 31,
    Z: 33
  };
  /** 台灣身分證字號檢查碼（A123456789 這種格式）。 */
  function idChecksum(s) {
    if (!/^[A-Z][12]\d{8}$/.test(s)) return false;
    var c = LETTER[s.charAt(0)],
      sum = Math.floor(c / 10) + (c % 10) * 9;
    for (var i = 1; i <= 8; i++) sum += +s.charAt(i) * (9 - i);
    sum += +s.charAt(9);
    return sum % 10 === 0;
  }

  var RULES = [
    ['email', /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g],
    [
      'mobile',
      /(?<![\d])(?:\+?886[-\s]?9|09)\d{2}[-\s]?\d{3}[-\s]?\d{3}(?!\d)|(?<![\d])\+?886[-\s]?9\d{2}[-\s]?\d{3}[-\s]?\d{3}(?!\d)/g
    ],
    ['id', /(?<![A-Za-z0-9])[A-Z][12]\d{8}(?!\d)/g],
    ['phone', /(?<![\d])(?:\(0[2-8]\d?\)|0[2-8]\d?)[-\s]?\d{3,4}[-\s]?\d{4}(?!\d)/g],
    [
      'address',
      /[一-鿿]{1,3}[縣市][一-鿿]{1,4}?[區鄉鎮市]?[一-鿿0-9]{1,12}?(?:路|街|大道)(?:[一二三四五六七八九十0-9]+段)?(?:\d+巷)?(?:\d+弄)?\d+號(?:之\d+)?(?:\d+樓)?/g
    ]
  ];

  /** 回傳 [{ type, text, line, inCode, context }]，依出現順序。 */
  function scan(text) {
    var src = String(text || '').replace(/\r\n?/g, '\n'),
      lines = src.split('\n'),
      out = [],
      inFence = false;
    lines.forEach(function (ln, li) {
      if (/^\s*(```|~~~)/.test(ln)) {
        inFence = !inFence;
        return;
      }
      var taken = []; // 已被前面規則認走的區間，避免同一串數字重複回報
      RULES.forEach(function (rule) {
        var re = new RegExp(rule[1].source, 'g'),
          m;
        while ((m = re.exec(ln)) !== null) {
          var s = m.index,
            e = s + m[0].length;
          if (
            taken.some(function (t) {
              return s < t[1] && e > t[0];
            })
          )
            continue;
          if (rule[0] === 'id' && !idChecksum(m[0])) continue; // 格式像但檢查碼不對：多半不是真的身分證字號
          taken.push([s, e]);
          out.push({
            type: rule[0],
            text: m[0],
            line: li + 1,
            inCode: inFence,
            context: ln.slice(Math.max(0, s - 18), Math.min(ln.length, e + 18)).trim()
          });
        }
      });
    });
    return out.sort(function (a, b) {
      return a.line - b.line;
    });
  }
  function summarize(findings) {
    var c = {};
    findings.forEach(function (f) {
      c[f.type] = (c[f.type] || 0) + 1;
    });
    return c;
  }
  return { scan: scan, summarize: summarize, idChecksum: idChecksum, TYPES: TYPES };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = VaultPii;
