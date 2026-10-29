/**
 * i18n.js — 介面翻譯（P3）
 * 程式裡所有看得到的字都寫成 T('中文原文')，原文就是鍵；語言檔（i18n/*.json）把原文對應到各語言。
 * 加一個語言只要加一個 JSON 檔（含 "@name"），不用改程式。找不到翻譯就顯示原文，不會空白。
 * 動態訊息（例如後端回傳的「找不到主題：xxx」）用含 {1}、{2} 的範本鍵比對。
 */
var VaultI18n = (function () {
  'use strict';
  var DICT = (typeof window !== 'undefined' && window.VAULT_I18N) || {}; // 建置時內嵌：{ 'zh-Hant': {...}, en: {...} }
  var lang = 'zh-Hant',
    pats = null;

  function esc(s) {
    return s.replace(/[.*+?^$()|[\]\\]/g, '\\$&');
  }
  function lit(k) {
    return k.replace(/\{\d+\}/g, '').length;
  }
  function buildPatterns() {
    pats = [];
    var d = DICT[lang] || {};
    Object.keys(d)
      .sort(function (a, b) {
        return lit(b) - lit(a);
      })
      .forEach(function (k) {
        if (!/\{\d+\}/.test(k) || lit(k) < 3) return; // 固定文字太短的範本太容易誤中，不參與反向比對
        var order = [],
          re =
            '^' +
            esc(k).replace(/\{(\d+)\}/g, function (m, n) {
              order.push(+n);
              return '([\\s\\S]+?)';
            }) +
            '$';
        pats.push({ re: new RegExp(re), order: order, out: d[k] });
      });
  }
  function fill(s, args) {
    return s.replace(/\{(\d+)\}/g, function (m, n) {
      var v = args[+n - 1];
      return v === undefined || v === null ? '' : String(v);
    });
  }
  function T(key) {
    if (typeof key !== 'string') return key;
    var d = DICT[lang],
      args = Array.prototype.slice.call(arguments, 1),
      s;
    if (d && Object.prototype.hasOwnProperty.call(d, key)) s = d[key];
    else if (d && args.length === 0 && /[　-〿一-鿿＀-￯]/.test(key)) {
      // 動態訊息：用範本鍵反向比對
      if (!pats) buildPatterns();
      for (var i = 0; i < pats.length; i++) {
        var m = pats[i].re.exec(key);
        if (m) {
          var vals = [];
          pats[i].order.forEach(function (n, j) {
            var x = m[j + 1];
            /* 擷取到的片段本身若也是翻譯鍵（例如「這則筆記」），一併翻譯 */ vals[n - 1] =
              Object.prototype.hasOwnProperty.call(d, x) ? d[x] : x;
          });
          return fill(pats[i].out, vals);
        }
      }
      s = key;
    } else s = key;
    return args.length ? fill(s, args) : s;
  }
  T.all = function (list) {
    return (list || []).map(function (x) {
      return T(x);
    });
  };

  function names() {
    return Object.keys(DICT).map(function (k) {
      return { id: k, name: (DICT[k] && DICT[k]['@name']) || k };
    });
  }
  function detect() {
    var nav =
      (typeof navigator !== 'undefined' &&
        ((navigator.languages && navigator.languages[0]) || navigator.language)) ||
      'zh-Hant';
    var l = String(nav).toLowerCase();
    var ids = Object.keys(DICT);
    for (var i = 0; i < ids.length; i++) if (ids[i].toLowerCase() === l) return ids[i];
    if (l.indexOf('zh') === 0 && DICT['zh-Hant']) return 'zh-Hant';
    var short = l.split('-')[0];
    for (var j = 0; j < ids.length; j++) if (ids[j].toLowerCase() === short) return ids[j];
    return DICT.en ? 'en' : 'zh-Hant';
  }
  function set(l) {
    if (!DICT[l]) l = 'zh-Hant';
    lang = l;
    pats = null;
    if (typeof document !== 'undefined' && document.documentElement) {
      try {
        document.documentElement.setAttribute('lang', l === 'zh-Hant' ? 'zh-Hant' : l);
      } catch (e) {
        /* 略 */
      }
    }
    applyStatic();
    return l;
  }
  /** 靜態 HTML：data-i18n（文字）、data-i18n-ph（placeholder）、data-i18n-label（aria-label）、data-i18n-title */
  function applyStatic() {
    if (typeof document === 'undefined' || !document.querySelectorAll) return;
    [
      [
        'data-i18n',
        function (e, v) {
          e.textContent = v;
        }
      ],
      [
        'data-i18n-ph',
        function (e, v) {
          e.setAttribute('placeholder', v);
        }
      ],
      [
        'data-i18n-label',
        function (e, v) {
          e.setAttribute('aria-label', v);
        }
      ],
      [
        'data-i18n-title',
        function (e, v) {
          e.setAttribute('title', v);
        }
      ]
    ].forEach(function (p) {
      Array.prototype.forEach.call(document.querySelectorAll('[' + p[0] + ']'), function (e) {
        p[1](e, T(e.getAttribute(p[0])));
      });
    });
    var t = document.querySelector && document.querySelector('title');
    if (t) t.textContent = T('讀書筆記 Vault');
  }
  return {
    T: T,
    set: set,
    get: function () {
      return lang;
    },
    detect: detect,
    names: names,
    applyStatic: applyStatic,
    dict: function () {
      return DICT;
    }
  };
})();
var T = VaultI18n.T;
if (typeof module !== 'undefined' && module.exports) module.exports = VaultI18n;
