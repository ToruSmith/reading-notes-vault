/**
 * themes.js — 主題資料與對比檢查（P3；純邏輯，不碰 DOM，可在 node 測試）
 * 每個主題是一組 CSS 變數的顏色。內建 10 個；自訂主題以 JSON 匯入／匯出（不提供調色盤）。
 * 規格：一般文字對比 ≥ 4.5:1（WCAG AA）。內建主題由測試強制；自訂主題在匯入時列出對比表，不達標會警告但不攔阻。
 */
var VaultThemes = (function () {
  'use strict';
  var K = function (s) {
    return s;
  }; // 只是標記：這個字串是翻譯鍵，顯示時由介面層 T() 轉換（掃描工具靠它找出鍵）
  var AA = 4.5;
  var TK = ['tk-k', 'tk-s', 'tk-c', 'tk-n', 'tk-f', 'tk-t', 'tk-a', 'tk-v']; // 程式碼高亮：關鍵字、字串、註解、數字、函式、型別、屬性、變數
  var CV = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6']; // 畫布 6 色（對應 Obsidian 的 1~6）
  var KEYS = ['bg', 'panel', 'fg', 'mute', 'line', 'accent', 'on', 'warn'].concat(TK, CV);
  var HEX = /^#[0-9a-fA-F]{6}$/;

  function v(bg, panel, fg, mute, line, accent, on, warn, tk, c) {
    var o = { bg: bg, panel: panel, fg: fg, mute: mute, line: line, accent: accent, on: on, warn: warn };
    TK.forEach(function (k, i) {
      o[k] = tk[i];
    });
    CV.forEach(function (k, i) {
      o[k] = c[i];
    });
    return o;
  }
  var LIGHT_TK = ['#7a3e9d', '#1f6b3a', '#5f5b52', '#a0390f', '#1f5fa8', '#8a4b12', '#2f5d62', '#9b2d6b'];
  var LIGHT_C = ['#b83a30', '#a85d10', '#7d6500', '#2e7d46', '#1f7488', '#6a49b8'];
  var DARK_C = ['#f27d73', '#e89a4a', '#d9b83a', '#5fbf7c', '#4fb5cc', '#b09cf0'];

  var LIST = [
    {
      id: 'paper',
      name: K('紙張'),
      dark: false,
      colors: v(
        '#faf8f3',
        '#f1ede3',
        '#1f1d1a',
        '#6a665d',
        '#ddd7c8',
        '#2f5d62',
        '#ffffff',
        '#8a4b12',
        LIGHT_TK,
        LIGHT_C
      )
    },
    {
      id: 'paper-dark',
      name: K('紙張・深色'),
      dark: true,
      colors: v(
        '#171815',
        '#1f201c',
        '#e9e6dc',
        '#a09c90',
        '#34352f',
        '#7fb7b0',
        '#10110f',
        '#e0a56a',
        ['#c9a0e8', '#8fd19e', '#a09c90', '#f0a37a', '#8ab8f0', '#e0b36a', '#7fb7b0', '#e69ac4'],
        DARK_C
      )
    },
    {
      id: 'sepia',
      name: K('棕褐'),
      dark: false,
      colors: v(
        '#f4ecd8',
        '#eadfc4',
        '#3b2f22',
        '#65543f',
        '#d3c3a0',
        '#7a4a1e',
        '#fffaf0',
        '#8a3a1a',
        ['#7a3e9d', '#1f6b3a', '#5b5240', '#9a3a0f', '#1f5a9a', '#7e4a10', '#2f5d62', '#9b2d6b'],
        LIGHT_C
      )
    },
    {
      id: 'tokyo-night',
      name: 'Tokyo Night',
      dark: true,
      colors: v(
        '#1a1b26',
        '#24283b',
        '#c0caf5',
        '#9aa5ce',
        '#3b4261',
        '#7aa2f7',
        '#1a1b26',
        '#e0af68',
        ['#bb9af7', '#9ece6a', '#9099c8', '#ff9e64', '#7aa2f7', '#e0af68', '#73daca', '#f7768e'],
        DARK_C
      )
    },
    {
      id: 'dracula',
      name: 'Dracula',
      dark: true,
      colors: v(
        '#282a36',
        '#343746',
        '#f8f8f2',
        '#b4b9d2',
        '#44475a',
        '#bd93f9',
        '#282a36',
        '#ffb86c',
        ['#ff79c6', '#f1fa8c', '#a8aed0', '#ffb86c', '#50fa7b', '#8be9fd', '#bd93f9', '#ff92d0'],
        DARK_C
      )
    },
    {
      id: 'nord',
      name: 'Nord',
      dark: true,
      colors: v(
        '#2e3440',
        '#3b4252',
        '#eceff4',
        '#c0c8d8',
        '#4c566a',
        '#88c0d0',
        '#2e3440',
        '#ebcb8b',
        ['#9bb6d4', '#a3be8c', '#aab4c8', '#eaa690', '#88c0d0', '#ebcb8b', '#8fbcbb', '#cba8c5'],
        DARK_C
      )
    },
    {
      id: 'catppuccin-mocha',
      name: 'Catppuccin Mocha',
      dark: true,
      colors: v(
        '#1e1e2e',
        '#313244',
        '#cdd6f4',
        '#a6adc8',
        '#45475a',
        '#89b4fa',
        '#1e1e2e',
        '#f9e2af',
        ['#cba6f7', '#a6e3a1', '#a6adc8', '#fab387', '#89b4fa', '#f9e2af', '#94e2d5', '#f5c2e7'],
        DARK_C
      )
    },
    {
      id: 'one-dark',
      name: 'One Dark',
      dark: true,
      colors: v(
        '#282c34',
        '#2c313a',
        '#abb2bf',
        '#9aa2b2',
        '#3e4451',
        '#61afef',
        '#282c34',
        '#e5c07b',
        ['#d48ae8', '#98c379', '#9aa2b2', '#d19a66', '#61afef', '#e5c07b', '#56b6c2', '#ee8189'],
        DARK_C
      )
    },
    {
      id: 'gruvbox-dark',
      name: 'Gruvbox Dark',
      dark: true,
      colors: v(
        '#282828',
        '#3c3836',
        '#ebdbb2',
        '#bdae93',
        '#504945',
        '#9cc3b5',
        '#282828',
        '#fabd2f',
        ['#e39bb0', '#b8bb26', '#bcad98', '#fe8019', '#9cc3b5', '#fabd2f', '#8ec07c', '#fe7d69'],
        DARK_C
      )
    },
    {
      id: 'solarized-light',
      name: 'Solarized Light',
      dark: false,
      colors: v(
        '#fdf6e3',
        '#eee8d5',
        '#073642',
        '#4f656c',
        '#d9d2bd',
        '#1f6e9e',
        '#fdf6e3',
        '#9a4a0a',
        ['#8a3d8a', '#4a6a00', '#4f656c', '#a63d12', '#1f6e9e', '#8a5a00', '#1d6d68', '#b03060'],
        LIGHT_C
      )
    }
  ];

  /* ───── 對比計算（WCAG 2.x） ───── */
  function lum(hex) {
    var c = [1, 3, 5].map(function (i) {
      var x = parseInt(hex.substr(i, 2), 16) / 255;
      return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }
  function ratio(a, b) {
    var x = lum(a),
      y = lum(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  }
  /** 要檢查的「前景／背景」配對。文字一律 ≥ 4.5。 */
  function pairs() {
    var out = [
      ['fg', 'bg'],
      ['fg', 'panel'],
      ['mute', 'bg'],
      ['mute', 'panel'],
      ['accent', 'bg'],
      ['accent', 'panel'],
      ['warn', 'bg'],
      ['warn', 'panel'],
      ['on', 'accent']
    ];
    TK.forEach(function (k) {
      out.push([k, 'panel'], [k, 'bg']);
    });
    CV.forEach(function (k) {
      out.push(['on', k]);
    });
    return out;
  }
  /** 回傳 { rows:[{fg,bg,ratio,ok}], ok, min }。 */
  function check(colors) {
    var rows = pairs().map(function (p) {
      var r = ratio(colors[p[0]], colors[p[1]]);
      return { fg: p[0], bg: p[1], ratio: r, ok: r >= AA };
    });
    return {
      rows: rows,
      ok: rows.every(function (r) {
        return r.ok;
      }),
      min: Math.min.apply(
        null,
        rows.map(function (r) {
          return r.ratio;
        })
      )
    };
  }
  function find(id) {
    for (var i = 0; i < LIST.length; i++) if (LIST[i].id === id) return LIST[i];
    return null;
  }

  /* ───── 自訂主題 JSON ───── */
  var FORMAT = 'vault-theme';
  function exportJSON(name, colors, base) {
    return JSON.stringify(
      { format: FORMAT, version: 1, name: name, extends: base || 'paper', colors: colors },
      null,
      2
    );
  }
  /** 解析匯入的 JSON。回傳 { ok, theme:{name, dark, colors}, check } 或 { ok:false, error }（error 是中文鍵，由呼叫端 T()）。 */
  function importJSON(text) {
    var o;
    try {
      o = JSON.parse(text);
    } catch (e) {
      return { ok: false, error: K('不是有效的 JSON') };
    }
    if (!o || typeof o !== 'object' || o.format !== FORMAT)
      return { ok: false, error: K('不是 Vault 主題檔（缺少 format: "vault-theme"）') };
    var base = find(o.extends) || LIST[0],
      cs = {},
      bad = [];
    var given = o.colors && typeof o.colors === 'object' ? o.colors : {};
    KEYS.forEach(function (k) {
      if (given[k] === undefined) cs[k] = base.colors[k];
      else if (typeof given[k] === 'string' && HEX.test(given[k])) cs[k] = given[k].toLowerCase();
      else bad.push(k);
    });
    if (bad.length) return { ok: false, error: K('這些顏色必須是 #rrggbb：{1}'), args: [bad.join(', ')] };
    var name = typeof o.name === 'string' && o.name.trim() ? o.name.trim().slice(0, 40) : K('自訂主題');
    var dark = lum(cs.bg) < 0.18;
    return { ok: true, theme: { id: 'custom', name: name, dark: dark, colors: cs }, check: check(cs) };
  }

  return {
    LIST: LIST,
    KEYS: KEYS,
    TK: TK,
    CV: CV,
    AA: AA,
    ratio: ratio,
    lum: lum,
    check: check,
    pairs: pairs,
    find: find,
    exportJSON: exportJSON,
    importJSON: importJSON,
    FORMAT: FORMAT
  };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = VaultThemes;
