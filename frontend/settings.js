/**
 * settings.js — 設定：介面語言、主題（P3）
 * 偏好存在這個瀏覽器的 IndexedDB（不用 localStorage）；讀不到或不能寫就只在這次有效，功能照常。
 * 主題 = 一組 CSS 變數：選「自動」就不覆寫，沿用樣式表依系統深淺色的預設。
 */
(function () {
  'use strict';
  var U = window.VaultUI,
    S = U.S,
    el = U.el,
    TH = VaultThemes,
    I = VaultI18n;
  var prefs = { lang: 'auto', theme: 'auto', custom: null };
  var root = document.documentElement;

  /* ───── 偏好儲存 ───── */
  var dbp = null;
  function openDb() {
    if (dbp) return dbp;
    dbp = new Promise(function (resolve) {
      try {
        var idb = window.indexedDB;
        if (!idb) return resolve(null);
        var r = idb.open('vault-prefs', 1);
        r.onupgradeneeded = function () {
          r.result.createObjectStore('kv');
        };
        r.onsuccess = function () {
          resolve(r.result);
        };
        r.onerror = r.onblocked = function () {
          resolve(null);
        };
      } catch (e) {
        resolve(null);
      }
    });
    return dbp;
  }
  function load() {
    return openDb().then(function (db) {
      if (!db) return null;
      return new Promise(function (resolve) {
        try {
          var rq = db.transaction('kv', 'readonly').objectStore('kv').get('prefs');
          rq.onsuccess = function () {
            resolve(rq.result || null);
          };
          rq.onerror = function () {
            resolve(null);
          };
        } catch (e) {
          resolve(null);
        }
      });
    });
  }
  function save() {
    return openDb().then(function (db) {
      if (!db) return;
      try {
        db.transaction('kv', 'readwrite')
          .objectStore('kv')
          .put(JSON.parse(JSON.stringify(prefs)), 'prefs');
      } catch (e) {
        /* 只是沒存到 */
      }
    });
  }

  /* ───── 套用 ───── */
  function currentTheme() {
    return prefs.theme === 'custom' ? prefs.custom : TH.find(prefs.theme);
  }
  function applyTheme() {
    var t = currentTheme();
    TH.KEYS.forEach(function (k) {
      root.style.removeProperty('--' + k);
    });
    if (!t) {
      root.removeAttribute('data-theme');
      root.style.removeProperty('color-scheme');
      return;
    }
    TH.KEYS.forEach(function (k) {
      root.style.setProperty('--' + k, t.colors[k]);
    });
    root.setAttribute('data-theme', t.id);
    root.style.colorScheme = t.dark ? 'dark' : 'light';
  }
  function applyLang() {
    I.set(prefs.lang === 'auto' ? I.detect() : prefs.lang);
  }
  function validPrefs(p) {
    var out = { lang: 'auto', theme: 'auto', custom: null };
    if (!p || typeof p !== 'object') return out;
    if (p.lang === 'auto' || I.dict()[p.lang]) out.lang = p.lang;
    if (
      p.custom &&
      p.custom.colors &&
      TH.KEYS.every(function (k) {
        return /^#[0-9a-fA-F]{6}$/.test(p.custom.colors[k]);
      })
    )
      out.custom = {
        id: 'custom',
        name: String(p.custom.name || '').slice(0, 40),
        dark: !!p.custom.dark,
        colors: p.custom.colors
      };
    if (p.theme === 'auto' || TH.find(p.theme) || (p.theme === 'custom' && out.custom)) out.theme = p.theme;
    return out;
  }

  /* ───── 畫面 ───── */
  var report = null; // 匯入自訂主題後的檢查結果 { ok, theme, check } 或 { ok:false, error }
  var dl = null; // 匯出的 JSON 文字（顯示在文字框，也提供下載）
  function pct(r) {
    return r.toFixed(2) + ' : 1';
  }
  var K = function (x) {
    return x;
  }; // 翻譯鍵標記（見 themes.js）
  var NAMES = {
    bg: K('背景'),
    panel: K('面板'),
    fg: K('文字'),
    mute: K('次要文字'),
    line: K('分隔線'),
    accent: K('強調色'),
    on: K('強調色上的文字'),
    warn: K('警示')
  };
  function colName(k) {
    return NAMES[k]
      ? T(NAMES[k])
      : /^tk-/.test(k)
        ? T('程式碼 {1}', k.slice(3))
        : /^c\d$/.test(k)
          ? T('畫布色 {1}', k.slice(1))
          : k;
  }

  function contrastTable(colors) {
    var c = TH.check(colors);
    var rows = c.rows.map(function (r) {
      return el('tr', { class: r.ok ? '' : 'bad' }, [
        el('td', { text: colName(r.fg) + ' / ' + colName(r.bg) }),
        el('td', {}, [
          el('span', {
            class: 'sw',
            style: 'background:' + colors[r.bg] + ';color:' + colors[r.fg],
            text: 'Aa'
          })
        ]),
        el('td', { text: pct(r.ratio) }),
        el('td', { text: r.ok ? T('通過') : T('未達 4.5') })
      ]);
    });
    return el('table', { class: 'ctab' }, [
      el('thead', {}, [
        el(
          'tr',
          {},
          [T('配對'), T('預覽'), T('對比'), T('AA')].map(function (h) {
            return el('th', { text: h });
          })
        )
      ]),
      el('tbody', {}, rows)
    ]);
  }

  function themeRow(id, name, colors, desc) {
    var on = prefs.theme === id;
    var b = el('button', {
      type: 'button',
      class: 'th' + (on ? ' on' : ''),
      'data-theme-id': id,
      'aria-pressed': on ? 'true' : 'false',
      onclick: function () {
        prefs.theme = id;
        applyTheme();
        save();
        U.render();
      }
    });
    if (colors)
      b.appendChild(
        el(
          'span',
          { class: 'sw3' },
          [colors.bg, colors.panel, colors.accent, colors.fg].map(function (c) {
            return el('i', { style: 'background:' + c });
          })
        )
      );
    else b.appendChild(el('span', { class: 'sw3 auto', text: '◐' }));
    b.appendChild(el('span', { class: 'tn', text: name }));
    if (desc) b.appendChild(el('span', { class: 'td', text: desc }));
    return b;
  }

  /** 設定是疊在目前畫面上的：筆記、編輯中的草稿、上傳、備份都原封不動保留，關掉設定就回到原處（含捲動位置）。 */
  function backLabel() {
    return S.note
      ? T('← 回到筆記')
      : S.edit
        ? T('← 回到編輯')
        : S.up || S.zip || S.topicEd
          ? T('← 返回')
          : T('← 回到列表');
  }
  var scrollBack = 0;
  function closeSettings() {
    S.settings = false;
    U.render();
    var y = scrollBack;
    if (window.requestAnimationFrame)
      requestAnimationFrame(function () {
        window.scrollTo(0, y);
      });
    else window.scrollTo(0, y);
    U.$('main').focus({ preventScroll: true });
  }
  /** 閱讀字級：A− / A+ 調整 vault-fontscale（預設 1），只影響筆記內文。 */
  function fontSection() {
    var out = el('span', { id: 's-fsval', text: Math.round(U.fontScale() * 100) + '%' });
    function step(d) {
      var v = U.setFontScale(d === 0 ? 1 : U.fontScale() + d);
      out.textContent = Math.round(v * 100) + '%';
    }
    return el('section', { class: 'spanel' }, [
      el('h3', { text: T('閱讀字級') }),
      el('p', { class: 'sub', text: T('只放大筆記內文，預設 100%。') }),
      el('div', { class: 'row' }, [
        el('button', {
          type: 'button',
          id: 's-fsdn',
          'aria-label': T('縮小字級'),
          text: 'A−',
          onclick: function () {
            step(-0.1);
          }
        }),
        out,
        el('button', {
          type: 'button',
          id: 's-fsup',
          'aria-label': T('放大字級'),
          text: 'A+',
          onclick: function () {
            step(0.1);
          }
        }),
        el('button', {
          type: 'button',
          id: 's-fs0',
          class: 'linkbtn',
          text: T('還原預設'),
          onclick: function () {
            step(0);
          }
        })
      ])
    ]);
  }
  /** 草稿：顯示目前暫存數，可一次清空。 */
  function draftSection() {
    var info = el('p', { class: 'sub', id: 's-dcount', text: '…' });
    function refresh() {
      U.Drafts.all().then(function (a) {
        info.textContent = a.length
          ? T('目前暫存 {1} 份草稿；未編輯的不會留，30 天沒動的自動清除。', a.length)
          : T('目前沒有暫存草稿。');
      });
    }
    refresh();
    return el('section', { class: 'spanel' }, [
      el('h3', { text: T('草稿') }),
      info,
      el('button', {
        type: 'button',
        id: 's-dclear',
        text: T('全部清除'),
        onclick: function () {
          U.Drafts.clear().then(refresh);
        }
      })
    ]);
  }
  U.renderSettings = function () {
    var main = U.$('main');
    main.textContent = '';
    main.appendChild(
      el('p', { class: 'back' }, [
        el('button', {
          type: 'button',
          class: 'linkbtn',
          id: 's-back',
          text: backLabel(),
          onclick: closeSettings
        })
      ])
    );
    main.appendChild(el('h2', { text: T('設定') }));

    /* 語言 */
    var sel = el(
      'select',
      { id: 's-lang', 'aria-label': T('介面語言') },
      [
        el('option', {
          value: 'auto',
          text: T('自動（跟隨瀏覽器）'),
          selected: prefs.lang === 'auto' ? 'selected' : false
        })
      ].concat(
        I.names().map(function (n) {
          return el('option', {
            value: n.id,
            text: n.name,
            selected: prefs.lang === n.id ? 'selected' : false
          });
        })
      )
    );
    sel.addEventListener('change', function () {
      prefs.lang = sel.value;
      applyLang();
      save();
      U.retranslate();
    });
    main.appendChild(
      el('section', { class: 'spanel' }, [
        el('h3', { text: T('介面語言') }),
        el('p', { class: 'sub', text: T('只影響介面文字；筆記內容不會被翻譯。') }),
        sel
      ])
    );

    /* 閱讀字級 */
    main.appendChild(fontSection());

    /* 草稿 */
    if (U.canNew && U.canNew()) {
      main.appendChild(draftSection());
      main.appendChild(U.cleanupSection());
    }

    /* 主題 */
    var list = el('div', { class: 'ths', role: 'group', 'aria-label': T('主題') }, [
      themeRow('auto', T('自動'), null, T('跟隨系統的淺色／深色'))
    ]);
    TH.LIST.forEach(function (t) {
      list.appendChild(themeRow(t.id, T(t.name), t.colors, t.dark ? T('深色') : T('淺色')));
    });
    if (prefs.custom)
      list.appendChild(
        themeRow('custom', prefs.custom.name || T('自訂主題'), prefs.custom.colors, T('自訂'))
      );
    var sec = el('section', { class: 'spanel' }, [
      el('h3', { text: T('主題') }),
      el('p', { class: 'sub', text: T('內建主題的一般文字對比都達 WCAG AA（4.5:1）。') }),
      list
    ]);
    var cur = currentTheme();
    if (cur)
      sec.appendChild(
        el('details', { class: 'toc', id: 's-contrast' }, [
          el('summary', { text: T('對比報告：{1}', T(cur.name)) }),
          contrastTable(cur.colors)
        ])
      );
    main.appendChild(sec);

    /* 自訂主題 */
    var ta = el('textarea', {
      id: 's-json',
      rows: '8',
      spellcheck: 'false',
      'aria-label': T('主題 JSON'),
      placeholder:
        '{ "format": "vault-theme", "version": 1, "name": "…", "extends": "paper", "colors": { "bg": "#ffffff" } }'
    });
    if (dl) ta.value = dl;
    var file = el('input', {
      type: 'file',
      accept: '.json,application/json',
      id: 's-file',
      'aria-label': T('選擇主題檔')
    });
    file.addEventListener('change', function () {
      var f = file.files[0];
      if (f)
        U.readFile(f).then(function (t) {
          ta.value = t;
          doImport(t);
        });
    });
    var cs = el('section', { class: 'spanel' }, [
      el('h3', { text: T('自訂主題') }),
      el('p', {
        class: 'sub',
        text: T('不提供調色盤：匯出目前主題的 JSON，改完顏色再匯入。沒填的顏色沿用 extends 指定的內建主題。')
      }),
      ta,
      el('div', { class: 'row' }, [
        el('button', {
          type: 'button',
          class: 'tbtn',
          id: 's-export',
          text: T('匯出目前主題'),
          onclick: function () {
            var t =
              currentTheme() ||
              TH.find(root.getAttribute('data-theme')) ||
              (matchMedia('(prefers-color-scheme: dark)').matches ? TH.find('paper-dark') : TH.find('paper'));
            dl = TH.exportJSON(t.name, t.colors, t.id === 'custom' ? 'paper' : t.id);
            U.render();
          }
        }),
        el('button', {
          type: 'button',
          class: 'tbtn',
          id: 's-import',
          text: T('匯入'),
          onclick: function () {
            doImport(ta.value);
          }
        }),
        file
      ])
    ]);
    if (dl)
      cs.appendChild(
        el('p', {}, [
          el('a', {
            class: 'linkbtn',
            id: 's-dl',
            download: 'vault-theme.json',
            href: 'data:application/json;charset=utf-8,' + encodeURIComponent(dl),
            text: T('下載 vault-theme.json')
          })
        ])
      );
    if (report) {
      if (!report.ok)
        cs.appendChild(
          el('p', {
            class: 'err',
            role: 'alert',
            id: 's-err',
            text: T(report.error, report.args && report.args[0])
          })
        );
      else {
        cs.appendChild(
          el('p', {
            id: 's-rep',
            class: report.check.ok ? 'sub' : 'err',
            text: report.check.ok
              ? T('「{1}」全部配對都達 4.5:1，可以套用。', report.theme.name)
              : T(
                  '「{1}」有配對未達 4.5:1（最低 {2}），仍可套用，但部分文字可能不易閱讀。',
                  report.theme.name,
                  report.check.min.toFixed(2)
                )
          })
        );
        cs.appendChild(contrastTable(report.theme.colors));
        cs.appendChild(
          el('p', {}, [
            el('button', {
              type: 'button',
              class: 'tbtn primary',
              id: 's-apply',
              text: T('套用這個主題'),
              onclick: function () {
                prefs.custom = report.theme;
                prefs.theme = 'custom';
                applyTheme();
                save();
                report = null;
                U.render();
              }
            })
          ])
        );
      }
    }
    main.appendChild(cs);
  };
  function doImport(text) {
    report = TH.importJSON(text);
    U.render();
  }

  U.openSettings = function () {
    if (S.settings) return;
    if (U.leaveCanvas && !U.leaveCanvas()) return; // 畫布有未儲存修改時照舊先詢問；其他畫面直接疊上去、保留原狀
    scrollBack = window.scrollY || 0;
    S.settings = true;
    U.render();
    U.$('main').focus({ preventScroll: true });
    window.scrollTo(0, 0);
  };
  U.prefs = function () {
    return prefs;
  };

  /* ───── 啟動：先用瀏覽器語言，讀到偏好後再套用 ───── */
  I.set(I.detect());
  var btn = document.getElementById('btnSettings');
  if (btn) btn.addEventListener('click', U.openSettings);
  load().then(function (p) {
    prefs = validPrefs(p);
    applyLang();
    applyTheme();
    U.retranslate();
  });
})();
