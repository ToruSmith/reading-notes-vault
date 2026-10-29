/**
 * canvas_embed.js — 畫布的嵌入卡片：HTML 檔卡片、PDF 卡片（P17）、以及「嵌入網頁」的連結卡片（P15）；
 * 每張嵌入卡的工具列有「⛶ 卡片全螢幕」（P17）。
 * 共同原則：預設只顯示標題與「載入」按鈕，不建立 iframe；同時最多 MAX_LIVE 個載入中，超過就收掉最舊的；
 * iframe 預設不接收滑鼠（平移／縮放畫布不會被卡住），按卡片上的「互動」才可操作。
 * 安全：HTML 檔用 srcdoc＋sandbox（不給 allow-same-origin；腳本只有 x-scripts 為 true 時才開）＋CSP（CL.embedDoc）；
 * 外部網頁只收 https，sandbox 也不給頂層導覽。純函式在 canvaslogic.js（htmlIdOf／embedUrl／embedDoc，有單元測試）。
 */
(function () {
  'use strict';
  var U = window.VaultUI,
    K = U.cv,
    CL = window.CanvasLogic,
    el = U.el;
  var MAX_LIVE = 3,
    MAX_BYTES = 500 * 1024,
    PDF_MAX = 5 * 1024 * 1024,
    HTML_OK = /\.html?$/i,
    PDF_OK = /\.pdf$/i;
  var live = []; // 載入中的卡片 { e, reset }，舊的在前

  function track(e, reset) {
    live = live.filter(function (x) {
      return x.e.isConnected && x.e !== e;
    });
    while (live.length >= MAX_LIVE) live.shift().reset();
    live.push({ e: e, reset: reset });
  }
  function untrack(e) {
    live = live.filter(function (x) {
      return x.e !== e;
    });
  }

  /**
   * 卡片全螢幕：用瀏覽器的全螢幕 API 讓這張卡片的 iframe 單獨撐滿螢幕（畫布本身已在全螢幕時也可以）。
   * 再按一次或 Esc 離開；不支援的瀏覽器（例如 iPhone）呼叫 fallback（通常是在新分頁開啟）。
   * 注意：卡片全螢幕時按 Esc，瀏覽器會一併結束畫布的瀏覽器全螢幕；畫布的全螢幕「版面」仍保留，再按「離開全螢幕」即可。
   */
  function toggleCardFull(frame, fallback) {
    var cur = document.fullscreenElement || document.webkitFullscreenElement;
    if (cur === frame) {
      var ex = document.exitFullscreen || document.webkitExitFullscreen;
      if (ex) ex.call(document);
      return;
    }
    var rq = frame.requestFullscreen || frame.webkitRequestFullscreen;
    if (!rq) {
      if (fallback) fallback();
      return;
    }
    try {
      var p = rq.call(frame);
      if (p && p.catch)
        p.catch(function () {
          if (fallback) fallback();
        });
    } catch (x) {
      if (fallback) fallback();
    }
  }

  /** 嵌入區：上面一條（標題、互動、↗ 等、卡片全螢幕、關閉），下面 iframe。fallback：不支援全螢幕時的替代動作。 */
  function frameBox(e, title, frame, onClose, extra, fallback) {
    var box = el('div', { class: 'cv-emb' });
    var interact = el('button', {
      type: 'button',
      class: 'cv-embbtn',
      'aria-pressed': 'false',
      title: T('開啟後可在卡片內捲動、點擊；關閉時拖曳與縮放畫布不會被卡住'),
      text: T('互動'),
      onclick: function (ev) {
        ev.stopPropagation();
        var on = !box.classList.contains('live');
        box.classList.toggle('live', on);
        interact.setAttribute('aria-pressed', on ? 'true' : 'false');
      }
    });
    var close = el('button', {
      type: 'button',
      class: 'cv-embbtn',
      'aria-label': T('關閉嵌入：{1}', title),
      text: '✕',
      onclick: function (ev) {
        ev.stopPropagation();
        onClose();
      }
    });
    var full = el('button', {
      type: 'button',
      class: 'cv-embbtn cv-embfull',
      title: T('卡片全螢幕（再按一次或 Esc 離開）'),
      'aria-label': T('卡片全螢幕：{1}', title),
      text: '⛶',
      onclick: function (ev) {
        ev.stopPropagation();
        toggleCardFull(frame, fallback);
      }
    });
    box.appendChild(
      el(
        'div',
        { class: 'cv-embbar' },
        [el('span', { class: 'cv-embt', text: title }), interact].concat(extra || [], [full, close])
      )
    );
    box.appendChild(frame);
    return box;
  }
  function note(text) {
    return el('span', { class: 'cv-ph', text: text });
  }

  /* ───── 開啟與下載（右鍵選單、雙擊、↗ 按鈕共用） ───── */
  function withHtml(id, fn) {
    return U.api('getHtml', { id: id })
      .then(function (r) {
        if (!r || !r.ok) {
          K.setStatus(T('（找不到這個 HTML 檔）'));
          return;
        }
        fn(r.text);
      })
      .catch(function () {
        K.setStatus(T('（HTML 載入失敗）'));
      });
  }
  /** 新分頁：先同步開空白頁（避免被擋彈出視窗），資料到了再換成外殼頁的 blob 網址（關掉分頁就失效）。 */
  function openTab(id, n) {
    var w = window.open('', '_blank');
    if (!w) {
      K.setStatus(T('瀏覽器擋住了新分頁，請允許這個網站的彈出視窗。'));
      return;
    }
    try {
      w.opener = null;
    } catch (e) {
      /* 略 */
    }
    return withHtml(id, function (text) {
      var url = URL.createObjectURL(
        new Blob([CL.openerDoc(text, n['x-title'], n['x-scripts'] === true)], { type: 'text/html' })
      );
      w.location.replace(url);
      setTimeout(function () {
        URL.revokeObjectURL(url);
      }, 60000);
    }).then(function () {
      /* 失敗時留下空白頁，使用者自行關閉 */
    });
  }
  function download(id, n) {
    return withHtml(id, function (text) {
      var url = URL.createObjectURL(new Blob([text], { type: 'text/html' })),
        a = document.createElement('a');
      a.href = url;
      a.setAttribute('download', String(n['x-title'] || id).replace(/[\\\/:*?"<>|]+/g, '_') + '.html');
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () {
        URL.revokeObjectURL(url);
      }, 10000);
    });
  }
  var menuEl = null,
    offFn = null;
  function closeMenu() {
    if (menuEl && menuEl.parentNode) menuEl.parentNode.removeChild(menuEl);
    menuEl = null;
    if (offFn) {
      document.removeEventListener('pointerdown', offFn, true);
      document.removeEventListener('keydown', offFn, true);
      offFn = null;
    }
  }
  function showMenu(ev, items) {
    closeMenu();
    menuEl = el(
      'div',
      { class: 'cv-ctx', role: 'menu' },
      items.map(function (it) {
        return el('button', {
          type: 'button',
          class: 'cv-ctxi',
          role: 'menuitem',
          text: it[0],
          onclick: function (e) {
            e.stopPropagation();
            closeMenu();
            it[1]();
          }
        });
      })
    );
    menuEl.style.left = Math.min(ev.clientX, window.innerWidth - 190) + 'px';
    menuEl.style.top = Math.min(ev.clientY, window.innerHeight - 100) + 'px';
    document.body.appendChild(menuEl);
    offFn = function (e) {
      // 點選單外面或按 Esc 就關
      if (e.type === 'keydown' && e.key !== 'Escape') return;
      if (e.type === 'pointerdown' && menuEl && menuEl.contains(e.target)) return;
      closeMenu();
    };
    document.addEventListener('pointerdown', offFn, true);
    document.addEventListener('keydown', offFn, true);
  }
  /** 右鍵選單與雙擊：menu＝[[文字, 動作]…]；雙擊執行 dbl。 */
  function bindOpen(e, menu, dbl) {
    e.addEventListener('contextmenu', function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      showMenu(ev, menu);
    });
    e.addEventListener('dblclick', function (ev) {
      if (ev.target.closest && ev.target.closest('.cv-embbtn, iframe')) return;
      ev.preventDefault();
      ev.stopPropagation();
      dbl();
    });
  }

  /* ───── HTML 檔卡片 ───── */
  function fillHtml(e, n, body, id) {
    e._filled = true;
    bindOpen(
      e,
      [
        [
          T('在新分頁開啟'),
          function () {
            openTab(id, n);
          }
        ],
        [
          T('下載 .html'),
          function () {
            download(id, n);
          }
        ]
      ],
      function () {
        openTab(id, n);
      }
    );
    var scripts = n['x-scripts'] === true,
      name = n['x-title'] || T('HTML 頁面');
    function show() {
      untrack(e);
      body.textContent = '';
      var go = el(
        'button',
        {
          type: 'button',
          class: 'cv-play',
          onclick: function (ev) {
            ev.stopPropagation();
            load();
          }
        },
        [
          el('strong', { text: name }),
          el('br'),
          T('▶ 載入 HTML（{1}）', scripts ? T('可執行腳本') : T('靜態顯示，不執行腳本'))
        ]
      );
      body.appendChild(go);
      body.appendChild(
        el('button', {
          type: 'button',
          class: 'cv-ext cv-linkbtn',
          text: T('↗ 在新分頁開啟（雙擊卡片也可以；右鍵可下載）'),
          onclick: function (ev) {
            ev.stopPropagation();
            openTab(id, n);
          }
        })
      );
    }
    function load() {
      body.textContent = '';
      body.appendChild(note(T('載入中…')));
      U.api('getHtml', { id: id })
        .then(function (r) {
          if (!e.isConnected) return;
          body.textContent = '';
          if (!r || !r.ok) {
            body.appendChild(note(T('（找不到這個 HTML 檔）')));
            return;
          }
          var f = el('iframe', {
            class: 'cv-yt',
            title: name,
            referrerpolicy: 'no-referrer',
            allow: 'fullscreen',
            sandbox: CL.embedSandbox(scripts)
          });
          f.srcdoc = CL.embedDoc(r.text, scripts);
          body.appendChild(
            frameBox(
              e,
              name,
              f,
              show,
              [
                el('button', {
                  type: 'button',
                  class: 'cv-embbtn',
                  title: T('在新分頁開啟'),
                  'aria-label': T('在新分頁開啟：{1}', name),
                  text: '↗',
                  onclick: function (ev) {
                    ev.stopPropagation();
                    openTab(id, n);
                  }
                })
              ],
              function () {
                openTab(id, n);
              }
            )
          );
          track(e, show);
        })
        .catch(function () {
          body.textContent = '';
          body.appendChild(note(T('（HTML 載入失敗）')));
        });
    }
    show();
  }

  /* ───── 嵌入網頁（連結卡片的 x-embed） ───── */
  function fillWeb(e, n, body) {
    var url = CL.embedUrl(n.url), // 嵌入用（Google 簡報／雲端硬碟的連結會自動換成可嵌入的網址）
      openUrl = CL.safeUrl(n.url) || url; // 「在新分頁開啟」用原本的連結
    e._filled = true;
    if (!url) {
      body.appendChild(note(T('只有 https 網址可以嵌入。')));
      return;
    }
    var host = CL.hostOf(url);
    function show() {
      untrack(e);
      body.textContent = '';
      body.appendChild(
        el(
          'button',
          {
            type: 'button',
            class: 'cv-play',
            onclick: function (ev) {
              ev.stopPropagation();
              load();
            }
          },
          [el('strong', { text: host }), el('br'), T('▶ 嵌入網頁（會連線到 {1}）', host)]
        )
      );
      body.appendChild(
        el('a', {
          href: openUrl,
          target: '_blank',
          rel: 'noopener noreferrer',
          class: 'cv-ext',
          text: T('在新分頁開啟')
        })
      );
    }
    function load() {
      body.textContent = '';
      var f = el('iframe', {
        class: 'cv-yt',
        src: url,
        title: host,
        referrerpolicy: 'strict-origin-when-cross-origin',
        allow: 'fullscreen',
        sandbox:
          'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-presentation'
      });
      body.appendChild(
        frameBox(
          e,
          host,
          f,
          show,
          [
            el('a', {
              href: openUrl,
              target: '_blank',
              rel: 'noopener noreferrer',
              class: 'cv-embbtn',
              title: T('網站不允許嵌入時（畫面空白），請在新分頁開啟'),
              text: '↗'
            })
          ],
          function () {
            window.open(openUrl, '_blank', 'noopener');
          }
        )
      );
      track(e, show);
    }
    show();
  }

  /* ───── PDF 卡片（P17）─────
   * 桌機：按「載入」用瀏覽器內建的 PDF 檢視器內嵌顯示；手機或不支援內嵌的瀏覽器：直接在新分頁開啟（一定能看）。
   * 內嵌用 blob 網址（不沙箱：瀏覽器的 PDF 檢視器不能放進沙箱 iframe；PDF 不是網頁，不會在本站網域執行腳本）。 */
  function withPdf(id, fn) {
    return U.api('getPdf', { id: id })
      .then(function (r) {
        var b64 = r && r.ok ? CL.pdfBase64(r.data) : null;
        if (!b64) {
          K.setStatus(T('（找不到這個 PDF 檔）'));
          return;
        }
        var bin = atob(b64),
          arr = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
        fn(URL.createObjectURL(new Blob([arr], { type: 'application/pdf' })));
      })
      .catch(function () {
        K.setStatus(T('（PDF 載入失敗）'));
      });
  }
  function openPdfTab(id) {
    var w = window.open('', '_blank');
    if (!w) {
      K.setStatus(T('瀏覽器擋住了新分頁，請允許這個網站的彈出視窗。'));
      return;
    }
    try {
      w.opener = null;
    } catch (e) {
      /* 略 */
    }
    return withPdf(id, function (url) {
      w.location.replace(url);
      setTimeout(function () {
        URL.revokeObjectURL(url);
      }, 600000);
    });
  }
  function downloadPdf(id, n) {
    return withPdf(id, function (url) {
      var a = document.createElement('a');
      a.href = url;
      a.setAttribute('download', String(n['x-title'] || id).replace(/[\\\/:*?"<>|]+/g, '_') + '.pdf');
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () {
        URL.revokeObjectURL(url);
      }, 10000);
    });
  }
  /** 這個瀏覽器能不能在卡片內顯示 PDF（桌機 Chrome／Edge／Firefox 可以；手機通常不行）。 */
  function pdfInline() {
    try {
      return navigator.pdfViewerEnabled === true && !window.matchMedia('(pointer: coarse)').matches;
    } catch (e) {
      return false;
    }
  }
  function fillPdf(e, n, body, id) {
    e._filled = true;
    var name = n['x-title'] || T('PDF 檔'),
      blobUrl = null;
    bindOpen(
      e,
      [
        [
          T('在新分頁開啟'),
          function () {
            openPdfTab(id);
          }
        ],
        [
          T('下載 .pdf'),
          function () {
            downloadPdf(id, n);
          }
        ]
      ],
      function () {
        openPdfTab(id);
      }
    );
    function release() {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
      blobUrl = null;
    }
    function show() {
      untrack(e);
      release();
      body.textContent = '';
      var inline = pdfInline();
      body.appendChild(
        el(
          'button',
          {
            type: 'button',
            class: 'cv-play',
            onclick: function (ev) {
              ev.stopPropagation();
              if (inline) load();
              else openPdfTab(id);
            }
          },
          [el('strong', { text: name }), el('br'), inline ? T('▶ 載入 PDF') : T('▶ 開啟 PDF（在新分頁）')]
        )
      );
      if (inline)
        body.appendChild(
          el('button', {
            type: 'button',
            class: 'cv-ext cv-linkbtn',
            text: T('↗ 在新分頁開啟（雙擊卡片也可以；右鍵可下載）'),
            onclick: function (ev) {
              ev.stopPropagation();
              openPdfTab(id);
            }
          })
        );
    }
    function load() {
      body.textContent = '';
      body.appendChild(note(T('載入中…')));
      withPdf(id, function (url) {
        if (!e.isConnected) {
          URL.revokeObjectURL(url);
          return;
        }
        release();
        blobUrl = url;
        body.textContent = '';
        var f = el('iframe', {
          class: 'cv-yt',
          title: name,
          referrerpolicy: 'no-referrer',
          allow: 'fullscreen',
          src: url
        });
        body.appendChild(
          frameBox(
            e,
            name,
            f,
            show,
            [
              el('button', {
                type: 'button',
                class: 'cv-embbtn',
                title: T('畫面空白或被瀏覽器封鎖時，請在新分頁開啟'),
                'aria-label': T('在新分頁開啟：{1}', name),
                text: '↗',
                onclick: function (ev) {
                  ev.stopPropagation();
                  openPdfTab(id);
                }
              })
            ],
            function () {
              openPdfTab(id);
            }
          )
        );
        track(e, show);
      }).then(function () {
        if (!blobUrl && e.isConnected && !body.querySelector('.cv-emb')) show();
      });
    }
    show();
  }

  /** 給 canvas.js 的 fillContent 呼叫：處理得了就回傳 true。 */
  function fill(e, n, body) {
    var id = n.type === 'file' ? CL.htmlIdOf(n.file) : null;
    if (id) {
      fillHtml(e, n, body, id);
      return true;
    }
    var pid = n.type === 'file' ? CL.pdfIdOf(n.file) : null;
    if (pid) {
      fillPdf(e, n, body, pid);
      return true;
    }
    if (n.type === 'link' && n['x-embed'] === true) {
      fillWeb(e, n, body);
      return true;
    }
    return false;
  }
  /** 屬性改變（腳本開關、嵌入開關）後，把卡片內容重做一次。 */
  function refill(id) {
    var C = K.C(),
      e = C && C.nodeEls[id],
      n = C && K.nodeMap()[id];
    if (!e || !n) return;
    var body = e.querySelector('.cv-body');
    if (!body) return;
    untrack(e);
    body.textContent = '';
    e._filled = false;
    K.fillContent(e, n);
  }

  /* ───── 新增 HTML 檔 ───── */
  function addHtmlFile(file, at) {
    var C = K.C();
    if (!C || !C.editable) return;
    if (!HTML_OK.test(file.name || '')) {
      K.setStatus(T('只支援 .html 檔。'));
      return;
    }
    if (file.size > MAX_BYTES) {
      K.setStatus(T('HTML 檔超過 500 KB 上限。'));
      return;
    }
    var topic = C.topic;
    K.setStatus(T('上傳 HTML 中…'));
    U.readFile(file)
      .then(function (text) {
        return U.api('uploadHtml', { text: text });
      })
      .then(function (r) {
        var C2 = K.C();
        if (!C2 || C2.topic !== topic) return;
        if (!r.ok) {
          K.setStatus(T('HTML 上傳失敗：{1}', T.all(r.reasons || [r.error]).join(T('；'))));
          return;
        }
        K.addNode(
          'file',
          { file: 'assets/' + r.id + '.html', 'x-title': file.name.replace(HTML_OK, '').slice(0, 60) },
          at,
          [520, 380]
        );
        K.setStatus(
          T('HTML 已加入（{1} KB）。', Math.max(1, Math.round(r.bytes / 1024))) + ' ' + T('記得按「儲存」。')
        );
      })
      .catch(function (x) {
        K.setStatus(T('HTML 上傳失敗：{1}', x.message));
      });
  }
  function pickHtml() {
    var inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = '.html,.htm,text/html';
    inp.style.display = 'none';
    document.body.appendChild(inp);
    inp.onchange = function () {
      if (inp.parentNode) inp.parentNode.removeChild(inp);
      var f = inp.files && inp.files[0];
      if (f) {
        var c = K.viewCenter();
        addHtmlFile(f, { x: c.x, y: c.y });
      }
    };
    inp.click();
  }

  /* ───── 新增 PDF 檔 ───── */
  function addPdfFile(file, at) {
    var C = K.C();
    if (!C || !C.editable) return;
    if (!PDF_OK.test(file.name || '')) {
      K.setStatus(T('只支援 .pdf 檔。'));
      return;
    }
    if (file.size > PDF_MAX) {
      K.setStatus(T('PDF 檔超過 5 MB 上限，請先壓縮或拆開。'));
      return;
    }
    var topic = C.topic;
    K.setStatus(T('上傳 PDF 中…'));
    new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () {
        resolve(String(fr.result).replace(/^data:[^;,]*;base64,/, 'data:application/pdf;base64,'));
      };
      fr.onerror = function () {
        reject(new Error(T('讀不到檔案')));
      };
      fr.readAsDataURL(file);
    })
      .then(function (data) {
        if (!CL.pdfBase64(data)) throw new Error(T('這不是有效的 PDF 檔。'));
        return U.api('uploadPdf', { data: data });
      })
      .then(function (r) {
        var C2 = K.C();
        if (!C2 || C2.topic !== topic) return;
        if (!r.ok) {
          K.setStatus(T('PDF 上傳失敗：{1}', T.all(r.reasons || [r.error]).join(T('；'))));
          return;
        }
        K.addNode(
          'file',
          { file: 'assets/' + r.id + '.pdf', 'x-title': file.name.replace(PDF_OK, '').slice(0, 60) },
          at,
          [520, 400]
        );
        K.setStatus(
          T('PDF 已加入（{1} KB）。', Math.max(1, Math.round(r.bytes / 1024))) + ' ' + T('記得按「儲存」。')
        );
      })
      .catch(function (x) {
        K.setStatus(T('PDF 上傳失敗：{1}', x.message));
      });
  }
  function pickPdf() {
    var inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = '.pdf,application/pdf';
    inp.style.display = 'none';
    document.body.appendChild(inp);
    inp.onchange = function () {
      if (inp.parentNode) inp.parentNode.removeChild(inp);
      var f = inp.files && inp.files[0];
      if (f) {
        var c = K.viewCenter();
        addPdfFile(f, { x: c.x, y: c.y });
      }
    };
    inp.click();
  }

  /* ───── 屬性欄（canvas_insp.js 呼叫） ───── */
  function check(id, label, hint, on, fn) {
    var cb = el('input', { type: 'checkbox', id: id });
    cb.checked = on;
    cb.addEventListener('change', function () {
      fn(cb.checked);
    });
    return el('p', { class: 'sub' }, [
      cb,
      ' ',
      el('label', { for: id, text: label }),
      hint ? el('br') : null,
      hint ? el('span', { text: hint }) : null
    ]);
  }
  function inspector(n, box) {
    if (n.type === 'link' && CL.embedUrl(n.url)) {
      box.appendChild(
        check(
          'cv-embed',
          T('嵌入網頁（按「載入」才連線）'),
          T('有些網站不允許被嵌入，會顯示空白；這時用卡片上的「↗」另開分頁。'),
          n['x-embed'] === true,
          function (on) {
            K.updateNode(n.id, { 'x-embed': on ? true : undefined });
            refill(n.id);
          }
        )
      );
    }
    if (n.type === 'file' && CL.htmlIdOf(n.file)) {
      box.appendChild(
        check(
          'cv-scripts',
          T('允許執行腳本'),
          T('預設只靜態顯示。只在你信任這份 HTML 時開啟；它仍無法讀取 Vault 的資料。'),
          n['x-scripts'] === true,
          function (on) {
            K.updateNode(n.id, { 'x-scripts': on ? true : undefined });
            refill(n.id);
          }
        )
      );
    }
  }

  K.embed = {
    fill: fill,
    refill: refill,
    pickHtml: pickHtml,
    pickPdf: pickPdf,
    addPdfFile: addPdfFile,
    pdfOk: function (f) {
      return PDF_OK.test(f.name || '');
    },
    addHtmlFile: addHtmlFile,
    inspector: inspector,
    htmlOk: function (f) {
      return HTML_OK.test(f.name || '');
    }
  };
})();
