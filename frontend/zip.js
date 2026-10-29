/**
 * zip.js — 完整 ZIP 備份：匯出與匯入（規劃書 12.2，使用者決定）
 * 結構：notes/<id>.md、assets/<id>.svg、topics/<id>.json、boards/<topic>.canvas.json、manifest.json（與 Drive 內的結構相同）。
 * 匯入是「還原」：保留原 id 與 public；id 或主題已存在時，內容相同略過、不同不覆寫並列入報告；
 * 預覽會先列出「還原後會公開的項目數」，確認才寫入。中斷後重選同一個 ZIP 再匯入即可，已存在的會略過。
 */
(function () {
  'use strict';
  var U = window.VaultUI,
    L = VaultLogic,
    el = U.el,
    S = U.S,
    api = U.api,
    Y = window.jsyaml,
    Z = window.JSZip;
  function LABEL(k) {
    return { ok: T('成功'), same: T('略過'), differs: T('需處理'), error: T('失敗') }[k];
  }

  function stamp() {
    var d = new Date(),
      p = function (n) {
        return ('0' + n).slice(-2);
      };
    return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes());
  }
  function paint() {
    if (S.zip) U.renderZip();
  }

  U.openZip = function () {
    S.settings = false;
    S.topicEd = null;
    S.note = null;
    S.edit = null;
    S.up = null;
    S.zip = { busy: false, msg: '', link: null, preview: null, items: [], fatal: '' };
    U.render();
  };

  /** 通用的分批讀取：沿著 cursor 一路讀到結束。 */
  function pullAll(action, onPage) {
    function go(cursor) {
      return api(action, { cursor: cursor, limit: 50 }).then(function (r) {
        if (!r.ok) throw new Error(T(r.error || '讀取失敗'));
        onPage(r);
        return r.cursor ? go(r.cursor) : null;
      });
    }
    return go(undefined);
  }

  /* ───── 匯出 ───── */
  function doExport() {
    var z = S.zip,
      zip = new Z(),
      n = { notes: 0, assets: 0, images: 0, htmls: 0, pdfs: 0, topics: 0, boards: 0 },
      missing = [];
    z.busy = true;
    z.msg = T('準備中…');
    z.link = null;
    z.fatal = '';
    paint();
    S.topics.forEach(function (t) {
      zip.file(
        'topics/' + t.id + '.json',
        JSON.stringify(
          {
            id: t.id,
            title: t.title,
            category: t.category || '',
            status: t.status || '',
            defaultPublic: t.defaultPublic === true
          },
          null,
          2
        )
      );
      n.topics++;
    });
    pullAll('exportBatch', function (r) {
      r.notes.forEach(function (x) {
        zip.file('notes/' + x.id + '.md', x.text);
        n.notes++;
      });
      (r.missing || []).forEach(function (m) {
        missing.push(m);
      });
      z.msg = T('匯出筆記 {1} / {2}', n.notes, r.total);
      paint();
    })
      .then(function () {
        return pullAll('exportAssets', function (r) {
          r.assets.forEach(function (a) {
            zip.file('assets/' + a.id + '.svg', a.svg);
            n.assets++;
          });
          z.msg = T('匯出 SVG {1}', n.assets);
          paint();
        });
      })
      .then(function () {
        return pullAll('exportImages', function (r) {
          r.images.forEach(function (a) {
            var m = /^data:image\/(png|jpeg|webp);base64,(.+)$/.exec(a.data || '');
            if (m) {
              zip.file('assets/' + a.id + '.' + (m[1] === 'jpeg' ? 'jpg' : m[1]), m[2], { base64: true });
              n.images++;
            }
          });
          z.msg = T('匯出圖片 {1}', n.images);
          paint();
        });
      })
      .then(function () {
        return pullAll('exportHtml', function (r) {
          r.htmls.forEach(function (a) {
            zip.file('assets/' + a.id + '.html', a.text);
            n.htmls++;
          });
          z.msg = T('匯出 HTML {1}', n.htmls);
          paint();
        });
      })
      .then(function () {
        return pullAll('exportPdf', function (r) {
          r.pdfs.forEach(function (a) {
            var m = /^data:application\/pdf;base64,(.+)$/.exec(a.data || '');
            if (m) {
              zip.file('assets/' + a.id + '.pdf', m[1], { base64: true });
              n.pdfs++;
            }
          });
          z.msg = T('匯出 PDF {1}', n.pdfs);
          paint();
        });
      })
      .then(function () {
        return S.topics.reduce(function (chain, t) {
          return chain.then(function () {
            return api('getBoard', { topic: t.id }).then(function (r) {
              if (r.ok && r.updatedAt) {
                zip.file('boards/' + t.id + '.canvas.json', JSON.stringify(r.board, null, 2));
                n.boards++;
              }
            });
          });
        }, Promise.resolve());
      })
      .then(function () {
        zip.file(
          'manifest.json',
          JSON.stringify(
            {
              format: 'vault-backup',
              version: 1,
              exportedAt: new Date().toISOString(),
              counts: n,
              missing: missing
            },
            null,
            2
          )
        );
        z.msg = T('壓縮中…');
        paint();
        return zip.generateAsync({ type: Z.support.blob ? 'blob' : 'uint8array', compression: 'DEFLATE' });
      })
      .then(function (data) {
        var blob = Z.support.blob ? data : new Blob([data], { type: 'application/zip' });
        var name = 'vault-backup-' + stamp() + '.zip',
          url = URL.createObjectURL(blob);
        z.link = { url: url, name: name, size: blob.size, counts: n, missing: missing };
        z.msg = T('完成');
        try {
          var a = document.createElement('a');
          a.href = url;
          a.download = name;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        } catch (e) {
          /* 自動下載被擋時，改用畫面上的連結 */
        }
      })
      .catch(function (e) {
        z.fatal = T('匯出失敗：{1}', e.message);
      })
      .then(function () {
        z.busy = false;
        paint();
      });
  }

  /* ───── 匯入：解析與預覽 ───── */
  function chooseZip(file) {
    var z = S.zip;
    z.busy = true;
    z.msg = T('讀取 ZIP…');
    z.fatal = '';
    z.preview = null;
    z.items = [];
    paint();
    var P = {
      notes: [],
      assets: [],
      images: [],
      htmls: [],
      pdfs: [],
      topics: [],
      boards: [],
      problems: [],
      ignored: 0
    };
    Z.loadAsync(file)
      .then(function (zip) {
        var list = [];
        zip.forEach(function (path, e) {
          if (!e.dir) list.push({ path: path, e: e });
        });
        return Promise.all(
          list.map(function (en) {
            var k = L.zipKind(en.path);
            if (!k.kind) {
              if (k.bad) P.problems.push(T('{1}：檔名不符合備份格式', en.path));
              else P.ignored++;
              return null;
            }
            if (k.kind === 'manifest') return null;
            if (k.kind === 'pdf')
              return en.e.async('base64').then(function (b) {
                var data = b.indexOf('JVBERi0') === 0 ? 'data:application/pdf;base64,' + b : null;
                if (!data) {
                  // 自動備份：內容是「資料網址」文字
                  try {
                    var t = atob(b);
                    if (/^data:application\/pdf;base64,[A-Za-z0-9+\/]+={0,2}$/.test(t)) data = t;
                  } catch (x) {
                    /* 略 */
                  }
                }
                if (data) P.pdfs.push({ id: k.id, data: data });
                else P.problems.push(T('{1}：不是有效的 PDF', en.path));
              });
            if (k.kind === 'imgtext')
              return en.e.async('string').then(function (text) {
                if (/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+\/]+={0,2}$/.test(text))
                  P.images.push({ id: k.id, data: text });
                else P.problems.push(T('{1}：不是有效的圖片', en.path));
              });
            if (k.kind === 'image')
              return en.e.async('base64').then(function (b) {
                P.images.push({
                  id: k.id,
                  data: 'data:image/' + (k.ext === 'jpg' ? 'jpeg' : k.ext) + ';base64,' + b
                });
              });
            return en.e.async('string').then(function (text) {
              if (k.kind === 'note') {
                var p = L.parseBackupNote(k.id, text, Y);
                if (p.ok) P.notes.push(p);
                else P.problems.push(T('{1}：{2}', en.path, T(p.problem)));
              } else if (k.kind === 'asset') P.assets.push({ id: k.id, text: text });
              else if (k.kind === 'html') P.htmls.push({ id: k.id, text: text });
              else {
                var o;
                try {
                  o = JSON.parse(text);
                } catch (e) {
                  P.problems.push(T('{1}：不是有效的 JSON', en.path));
                  return;
                }
                if (k.kind === 'topic') {
                  if (o && o.id === k.id && o.title)
                    P.topics.push({
                      id: o.id,
                      title: String(o.title),
                      category: String(o.category || ''),
                      status: String(o.status || ''),
                      defaultPublic: o.defaultPublic === true
                    });
                  else P.problems.push(T('{1}：主題檔內容不符', en.path));
                } else P.boards.push({ topic: k.id, board: o });
              }
            });
          })
        );
      })
      .then(function () {
        var defaults = {},
          newTopics = P.topics.filter(function (t) {
            return !S.tmap[t.id];
          });
        S.topics.forEach(function (t) {
          defaults[t.id] = t.defaultPublic === true;
        });
        newTopics.forEach(function (t) {
          defaults[t.id] = t.defaultPublic;
        });
        var fresh = P.notes.filter(function (n) {
          return !S.byId[n.id];
        });
        z.preview = {
          P: P,
          newTopics: newTopics,
          publicNotes: L.publicRestoreList(fresh, defaults),
          publicTopics: newTopics.filter(function (t) {
            return t.defaultPublic;
          }),
          freshNotes: fresh.length
        };
      })
      .catch(function (e) {
        z.fatal = T('無法讀取這個 ZIP：{1}', e.message);
      })
      .then(function () {
        z.busy = false;
        z.msg = '';
        paint();
      });
  }

  /* ───── 匯入：還原 ───── */
  function runRestore() {
    var z = S.zip,
      P = z.preview.P,
      localNotes = {},
      localAssets = {},
      localImages = {},
      localHtmls = {},
      localPdfs = {},
      total =
        P.topics.length +
        P.assets.length +
        P.images.length +
        P.htmls.length +
        P.pdfs.length +
        P.notes.length +
        P.boards.length,
      done = 0;
    z.preview = null;
    z.items = [];
    z.busy = true;
    z.fatal = '';
    paint();
    var add = function (kind, label, status, msg) {
      var it = { kind: kind, label: label, status: status, msg: msg || '' };
      z.items.push(it);
      done++;
      z.msg = T('還原中：{1} / {2}', done, total);
      paint();
      return it;
    };
    var chain = Promise.resolve();
    var step = function (fn) {
      chain = chain.then(fn);
    };

    if (
      P.notes.some(function (n) {
        return S.byId[n.id];
      })
    )
      step(function () {
        return pullAll('exportBatch', function (r) {
          r.notes.forEach(function (x) {
            localNotes[x.id] = x.text;
          });
        });
      });
    if (P.assets.length)
      step(function () {
        return pullAll('exportAssets', function (r) {
          r.assets.forEach(function (x) {
            localAssets[x.id] = x.svg;
          });
        });
      });

    P.topics.forEach(function (t) {
      step(function () {
        if (S.tmap[t.id]) return add(T('主題'), t.title, 'same', T('已存在，沿用本機設定'));
        return api('saveTopic', {
          id: t.id,
          title: t.title,
          category: t.category,
          status: t.status,
          defaultPublic: t.defaultPublic,
          confirmPublic: true
        }).then(function (r) {
          add(
            T('主題'),
            t.title,
            r.ok ? 'ok' : 'error',
            r.ok
              ? t.defaultPublic
                ? T('已建立（公開）')
                : T('已建立')
              : T.all(r.reasons || [r.error]).join(T('；'))
          );
        });
      });
    });
    if (P.images.length)
      step(function () {
        return pullAll('exportImages', function (r) {
          r.images.forEach(function (x) {
            localImages[x.id] = x.data;
          });
        });
      });
    if (P.htmls.length)
      step(function () {
        return pullAll('exportHtml', function (r) {
          r.htmls.forEach(function (x) {
            localHtmls[x.id] = x.text;
          });
        });
      });
    if (P.pdfs.length)
      step(function () {
        return pullAll('exportPdf', function (r) {
          r.pdfs.forEach(function (x) {
            localPdfs[x.id] = x.data;
          });
        });
      });
    P.pdfs.forEach(function (a) {
      step(function () {
        if (a.id in localPdfs)
          return add(
            'PDF',
            a.id,
            localPdfs[a.id] === a.data ? 'same' : 'differs',
            localPdfs[a.id] === a.data ? T('已存在且內容相同') : T('已存在但內容不同，未覆寫')
          );
        return api('uploadPdf', { id: a.id, data: a.data }).then(function (r) {
          add('PDF', a.id, r.ok ? 'ok' : 'error', r.ok ? '' : T.all(r.reasons || [r.error]).join(T('；')));
        });
      });
    });
    P.htmls.forEach(function (a) {
      step(function () {
        if (a.id in localHtmls)
          return add(
            'HTML',
            a.id,
            localHtmls[a.id] === a.text ? 'same' : 'differs',
            localHtmls[a.id] === a.text ? T('已存在且內容相同') : T('已存在但內容不同，未覆寫')
          );
        return api('uploadHtml', { id: a.id, text: a.text }).then(function (r) {
          add('HTML', a.id, r.ok ? 'ok' : 'error', r.ok ? '' : T.all(r.reasons || [r.error]).join(T('；')));
        });
      });
    });
    P.images.forEach(function (a) {
      step(function () {
        if (a.id in localImages)
          return add(
            T('圖片'),
            a.id,
            localImages[a.id] === a.data ? 'same' : 'differs',
            localImages[a.id] === a.data ? T('已存在且內容相同') : T('已存在但內容不同，未覆寫')
          );
        return api('uploadImage', { id: a.id, data: a.data }).then(function (r) {
          add(
            T('圖片'),
            a.id,
            r.ok ? 'ok' : 'error',
            r.ok ? '' : T.all(r.reasons || [r.error]).join(T('；'))
          );
        });
      });
    });
    P.assets.forEach(function (a) {
      step(function () {
        if (a.id in localAssets)
          return add(
            'SVG',
            a.id,
            localAssets[a.id] === a.text ? 'same' : 'differs',
            localAssets[a.id] === a.text ? T('已存在且內容相同') : T('已存在但內容不同，未覆寫')
          );
        return api('uploadSvg', { id: a.id, text: a.text }).then(function (r) {
          add('SVG', a.id, r.ok ? 'ok' : 'error', r.ok ? '' : T.all(r.reasons || [r.error]).join(T('；')));
        });
      });
    });
    P.notes.forEach(function (n) {
      step(function () {
        if (n.id in localNotes)
          return add(
            T('筆記'),
            n.id,
            localNotes[n.id] === n.text ? 'same' : 'differs',
            localNotes[n.id] === n.text ? T('已存在且內容相同') : T('已存在但內容不同，未覆寫')
          );
        return api('saveNote', { id: n.id, text: n.text }).then(function (r) {
          add(
            T('筆記'),
            T('{1}　{2}', n.id, n.meta.title || ''),
            r.ok ? 'ok' : 'error',
            r.ok ? '' : T.all(r.reasons || [r.error]).join(T('；'))
          );
        });
      });
    });
    P.boards.forEach(function (b) {
      step(function () {
        return api('getBoard', { topic: b.topic }).then(function (r) {
          if (!r.ok) return add(T('畫布'), b.topic, 'error', T('找不到主題，未還原'));
          var has = r.updatedAt && ((r.board.nodes || []).length || (r.board.edges || []).length);
          if (has) {
            var same = JSON.stringify(r.board) === JSON.stringify(b.board);
            return add(
              T('畫布'),
              b.topic,
              same ? 'same' : 'differs',
              same ? T('已存在且內容相同') : T('本機已有畫布，未覆寫')
            );
          }
          return api('saveBoard', {
            topic: b.topic,
            board: b.board,
            baseUpdatedAt: r.updatedAt || undefined
          }).then(function (s) {
            add(
              T('畫布'),
              b.topic,
              s.ok ? 'ok' : 'error',
              s.ok ? '' : T.all(s.reasons || [s.error]).join(T('；'))
            );
          });
        });
      });
    });

    chain
      .catch(function (e) {
        z.fatal = T('還原中斷：{1}（重選同一個 ZIP 再匯入即可，已存在的會略過）', e.message);
      })
      .then(function () {
        return U.reload();
      })
      .then(function () {
        z.busy = false;
        z.msg = '';
        paint();
      });
  }

  /* ───── 畫面 ───── */
  function counts(items) {
    var c = {};
    items.forEach(function (it) {
      c[it.status] = (c[it.status] || 0) + 1;
    });
    return c;
  }

  U.renderZip = function () {
    if (S.settings) return; // 設定疊在上面時，背景的非同步更新不要蓋掉設定畫面
    var z = S.zip,
      main = U.$('main');
    main.textContent = '';
    main.appendChild(
      el('p', { class: 'back' }, [
        el('button', {
          type: 'button',
          class: 'linkbtn',
          text: T('← 回到列表'),
          onclick: function () {
            S.zip = null;
            U.render();
          }
        })
      ])
    );
    main.appendChild(el('h2', { text: T('備份與還原') }));

    main.appendChild(el('h3', { text: T('匯出完整備份') }));
    main.appendChild(
      el('p', {
        class: 'sub',
        text: T(
          '包含所有筆記、SVG、主題與畫布，結構與 Drive 內相同。筆記是純 Markdown，可直接用其他編輯器開啟。'
        )
      })
    );
    main.appendChild(
      el('p', {}, [
        el('button', {
          type: 'button',
          class: 'primary',
          id: 'z-export',
          text: T('匯出 ZIP'),
          disabled: z.busy ? 'disabled' : false,
          onclick: doExport
        })
      ])
    );
    if (z.link) {
      var c = z.link.counts;
      main.appendChild(
        el('p', {
          class: 'status',
          role: 'status',
          text: T(
            '完成：筆記 {1}、SVG {2}、主題 {3}、畫布 {4}（{5} KB）{6}',
            c.notes,
            c.assets,
            c.topics,
            c.boards,
            Math.round(z.link.size / 1024),
            z.link.missing.length ? T('；有 {1} 則讀不到檔案，已略過', z.link.missing.length) : ''
          )
        })
      );
      main.appendChild(
        el('p', {}, [
          T('若瀏覽器沒有自動開始下載，請按：'),
          el('a', { href: z.link.url, download: z.link.name, id: 'z-link', text: z.link.name })
        ])
      );
    }

    main.appendChild(el('h3', { text: T('匯入備份（還原）') }));
    main.appendChild(
      el('p', {
        class: 'sub',
        text: T(
          '保留原本的 id 與公開設定。已存在的筆記與主題不會被覆寫：內容相同就略過，不同則列入報告由你處理。'
        )
      })
    );
    var pick = el('input', { type: 'file', id: 'z-file', accept: '.zip,application/zip' });
    pick.disabled = z.busy;
    pick.addEventListener('change', function () {
      if (pick.files && pick.files[0]) chooseZip(pick.files[0]);
    });
    main.appendChild(el('label', { class: 'fld' }, [el('span', { text: T('選擇 ZIP 檔') }), pick]));

    if (z.msg && z.busy)
      main.appendChild(el('p', { class: 'status', role: 'status', 'aria-live': 'polite', text: z.msg }));
    if (z.fatal) main.appendChild(el('p', { class: 'err', role: 'alert', text: z.fatal }));

    if (z.preview) {
      var pv = z.preview,
        P = pv.P,
        pubN = pv.publicNotes.length + pv.publicTopics.length;
      var lines = [
        T('筆記 {1} 則（其中新增 {2} 則，其餘本機已有）', P.notes.length, pv.freshNotes),
        T(
          'SVG {1} 個、主題 {2} 個（新增 {3} 個）、畫布 {4} 張',
          P.assets.length,
          P.topics.length,
          pv.newTopics.length,
          P.boards.length
        )
      ];
      if (P.ignored) lines.push(T('無法辨識而略過的檔案 {1} 個', P.ignored));
      main.appendChild(
        el('section', { class: 'panel' }, [
          el('h3', { text: T('匯入預覽（尚未寫入任何資料）') }),
          el(
            'ul',
            { class: 'q' },
            lines.map(function (t) {
              return el('li', { text: t });
            })
          ),
          pubN
            ? el('p', {
                class: 'err',
                role: 'alert',
                text: T(
                  '注意：還原後有 {1} 項會成為公開（公開主題 {2} 個、公開筆記 {3} 則）。確認前請先確定這個備份是你自己的。',
                  pubN,
                  pv.publicTopics.length,
                  pv.publicNotes.length
                )
              })
            : null,
          P.problems.length
            ? el(
                'ul',
                { class: 'rs' },
                P.problems.slice(0, 10).map(function (t) {
                  return el('li', { text: t });
                })
              )
            : null,
          el('div', { class: 'row' }, [
            el('button', {
              type: 'button',
              class: 'primary',
              id: 'z-go',
              text: pubN ? T('確認匯入（含 {1} 項公開）', pubN) : T('開始匯入'),
              onclick: runRestore
            }),
            el('button', {
              type: 'button',
              class: 'linkbtn',
              text: T('取消'),
              onclick: function () {
                z.preview = null;
                paint();
              }
            })
          ])
        ])
      );
    }

    if (z.items.length) {
      var c2 = counts(z.items),
        bad = z.items.filter(function (it) {
          return it.status === 'differs' || it.status === 'error';
        });
      main.appendChild(
        el('p', {
          class: 'status',
          role: 'status',
          text: T(
            '{1}成功 {2}、略過 {3}、需處理 {4}、失敗 {5}',
            z.busy ? '' : T('還原完畢：'),
            c2.ok || 0,
            c2.same || 0,
            c2.differs || 0,
            c2.error || 0
          )
        })
      );
      if (bad.length)
        main.appendChild(
          el(
            'ul',
            { class: 'q' },
            bad
              .slice(0, 40)
              .map(function (it) {
                return el('li', {}, [
                  el('span', { class: 'st ' + it.status, text: LABEL(it.status) }),
                  T(' {1}：{2}{3}', it.kind, it.label, it.msg ? T('　{1}', it.msg) : '')
                ]);
              })
              .concat(bad.length > 40 ? [el('li', { text: T('…另有 {1} 項', bad.length - 40) })] : [])
          )
        );
    }
  };
})();
