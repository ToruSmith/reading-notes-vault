/**
 * upload.js — 上傳與匯入（MD、SVG；多檔或整個資料夾）
 * 規則（規劃書 D17、D23，使用者決定）
 *  - 缺的 front matter 欄位補在 Drive 的副本上，不動使用者電腦上的原檔。
 *  - 原檔的 public 一律清除並列入報告；新主題一律是私人。
 *  - 以「主題＋來源路徑」比對重複：內容相同略過；內容不同不覆寫，列入報告。
 *  - [[標題]] 以標題轉成 id；SVG 引用改成 assets/<id>.svg；轉不了的保留原樣並列入報告，不中斷。
 *  - 逐檔處理；每個檔案的 id 事先產生，重送不會重複建立。
 *  - 進度存 IndexedDB（獨立資料庫）；關掉瀏覽器後再開，可從上次中斷處續傳。環境不允許時退回記憶體並提示。
 */
(function () {
  'use strict';
  var U = window.VaultUI,
    L = VaultLogic,
    el = U.el,
    S = U.S,
    api = U.api,
    Y = window.jsyaml;
  function LABEL(k) {
    return {
      pending: T('等待'),
      saving: T('處理中…'),
      ok: T('成功'),
      same: T('略過'),
      differs: T('需處理'),
      error: T('失敗')
    }[k];
  } // 每次呼叫才翻譯，切換語言才會生效
  var TEXT_RE = /\.(md|markdown)$/i,
    SVG_RE = /\.svg$/i;

  function today() {
    var d = new Date(),
      p = function (n) {
        return ('0' + n).slice(-2);
      };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }

  /* ───── 匯入進度的儲存 ───── */
  var Jobs = (function () {
    var db = null,
      mem = {},
      ready = null;
    function open() {
      if (ready) return ready;
      ready = new Promise(function (res) {
        try {
          var r = indexedDB.open('vault-imports', 1);
          r.onupgradeneeded = function () {
            r.result.createObjectStore('jobs', { keyPath: 'key' });
          };
          r.onsuccess = function () {
            db = r.result;
            res();
          };
          r.onerror = r.onblocked = function () {
            res();
          };
        } catch (e) {
          res();
        }
      });
      return ready;
    }
    function req(mode, fn) {
      return new Promise(function (res) {
        try {
          var r = fn(db.transaction('jobs', mode).objectStore('jobs'));
          r.onsuccess = function () {
            res(r.result);
          };
          r.onerror = function () {
            res(undefined);
          };
        } catch (e) {
          res(undefined);
        }
      });
    }
    var range = function (p) {
      return IDBKeyRange.bound(p, p + '\uffff');
    };
    return {
      persistent: function () {
        return open().then(function () {
          return !!db;
        });
      },
      put: function (v) {
        return open().then(function () {
          if (!db) {
            mem[v.key] = v;
            return;
          }
          return req('readwrite', function (s) {
            return s.put(v);
          });
        });
      },
      get: function (k) {
        return open().then(function () {
          return db
            ? req('readonly', function (s) {
                return s.get(k);
              })
            : mem[k];
        });
      },
      all: function (p) {
        return open().then(function () {
          if (!db)
            return Object.keys(mem)
              .filter(function (k) {
                return k.indexOf(p) === 0;
              })
              .sort()
              .map(function (k) {
                return mem[k];
              });
          return req('readonly', function (s) {
            return s.getAll(range(p));
          }).then(function (r) {
            return r || [];
          });
        });
      },
      delPrefix: function (p) {
        return open().then(function () {
          if (!db) {
            Object.keys(mem).forEach(function (k) {
              if (k.indexOf(p) === 0) delete mem[k];
            });
            return;
          }
          return req('readwrite', function (s) {
            return s['delete'](range(p));
          });
        });
      }
    };
  })();
  U.ImportJobs = Jobs;

  var itemKey = function (job, i) {
    return 'item:' + job.id + ':' + ('000000' + i).slice(-6);
  };
  function persistItem(it) {
    var o = {};
    Object.keys(it).forEach(function (k) {
      o[k] = it[k];
    });
    if (it.status === 'ok' || it.status === 'same' || it.status === 'differs') o.text = null; // 已完成的不必再存全文
    return Jobs.put({ key: itemKey(S.up.job, it.idx), item: o });
  }

  /* ───── 進入畫面 ───── */
  U.openUpload = function () {
    S.settings = false;
    S.topicEd = null;
    var t = S.f.topic && S.f.topic !== L.NONE && S.tmap[S.f.topic] ? S.f.topic : '';
    S.note = null;
    S.edit = null;
    S.zip = null;
    S.up = { topic: t, items: [], running: false, job: null, preview: null, resumable: null, fatal: '' };
    U.render();
    var up = S.up;
    Jobs.get('job').then(function (j) {
      if (j && S.up === up && !up.items.length) {
        up.resumable = j;
        U.render();
      }
    });
  };

  /* ───── 規劃：把檔案清單變成待處理項目 ───── */
  function plan(entries) {
    var now = today(),
      items = [],
      drafts = [],
      idx = 0;
    entries
      .filter(function (e) {
        return SVG_RE.test(e.name);
      })
      .forEach(function (e) {
        items.push({
          idx: idx++,
          kind: 'svg',
          name: e.name,
          path: e.path || e.name,
          id: L.newId(now),
          text: e.text,
          status: 'pending'
        });
      });
    entries
      .filter(function (e) {
        return TEXT_RE.test(e.name);
      })
      .forEach(function (e) {
        var it = { idx: idx++, kind: 'md', name: e.name, path: e.path || e.name, status: 'pending' };
        var p = L.prepareImport(e.text, e.name, {
          jsyaml: Y,
          topic: e.topicId || '',
          today: now,
          source: e.source
        });
        items.push(it);
        if (!p.ok) {
          it.status = 'error';
          it.fatal = true;
          it.msg = T(p.error);
          return;
        }
        it.id = p.id;
        it.topic = p.meta.topic;
        it.source = p.meta.source;
        it.title = p.title;
        it.added = p.added;
        it.strippedPublic = p.strippedPublic;
        drafts.push({ it: it, p: p });
      });
    var svgMap = L.buildSvgMap(
      items.filter(function (i) {
        return i.kind === 'svg';
      })
    );
    var tmap = L.buildTitleMap(
      S.items,
      drafts.map(function (d) {
        return { id: d.it.id, title: d.it.title };
      })
    );
    drafts.forEach(function (d) {
      var rw = L.rewriteSvgRefs(d.p.body, svgMap),
        rl = L.resolveLinks(rw.body, tmap);
      d.it.rewritten = rw.rewritten;
      d.it.resolved = rl.resolved;
      d.it.unresolved = rl.unresolved;
      d.it.text = L.composeNote(d.p.meta, rl.body, Y);
    });
    return items;
  }

  function startJob(entries, topicsToCreate, ignored) {
    var up = S.up,
      items = plan(entries);
    up.preview = null;
    up.items = items;
    up.job = {
      key: 'job',
      id: String(Date.now()),
      createdAt: Date.now(),
      total: items.length,
      topicsToCreate: topicsToCreate,
      ignored: ignored.length,
      ignoredSample: ignored.slice(0, 10)
    };
    Promise.all([Jobs.put(up.job)].concat(items.map(persistItem))).then(run);
  }

  /* ───── 逐檔處理 ───── */
  function fail(it, msg) {
    it.status = 'error';
    it.msg = msg;
  }
  function process(it) {
    if (it.kind === 'svg') {
      return api('uploadSvg', { id: it.id, text: it.text }).then(function (r) {
        if (!r.ok) return fail(it, T.all(r.reasons || [r.error]).join(T('；')));
        it.status = 'ok';
        it.msg = T(
          'SVG 已上傳，id：{1}{2}',
          r.id,
          r.removed && r.removed.length ? T('（清除 {1} 項不安全內容）', r.removed.length) : ''
        );
        if (r.warnings && r.warnings.length) it.warn = T.all(r.warnings).join(' ');
      });
    }
    var dup = L.findDup(S.items, it.topic, it.source);
    var check = dup
      ? api('getNote', { id: dup.id }).then(function (r) {
          var mine = L.splitNote(it.text, Y).body;
          if (r.ok && String(r.body).trim() === String(mine).trim()) {
            it.status = 'same';
            it.msg = T('已存在且內容相同，略過');
          } else {
            it.status = 'differs';
            it.msg = T('已有同一來源的筆記（{1}），但內容不同，未覆寫', dup.id);
          }
          return false;
        })
      : Promise.resolve(true);
    return check.then(function (doSave) {
      if (!doSave) return null;
      return api('saveNote', { id: it.id, text: it.text }).then(function (r) {
        if (!r.ok) return fail(it, T.all(r.reasons || [r.error]).join(T('；')));
        it.status = 'ok';
        it.msg = r.deduped ? T('先前已儲存成功') : T('已新增');
        if (r.warnings && r.warnings.length) it.warn = T.all(r.warnings).join(' ');
      });
    });
  }

  function ensureTopics(list) {
    var chain = Promise.resolve();
    list.forEach(function (t) {
      if (S.tmap[t.id]) return; // 已存在就不動（避免把使用者之後改過公開的主題改回私人）
      chain = chain.then(function () {
        return api('saveTopic', { id: t.id, title: t.title, defaultPublic: false }).then(function (r) {
          if (!r.ok)
            throw new Error(
              T('建立主題「{1}」失敗：{2}', t.title, T.all(r.reasons || [r.error]).join(T('；')))
            );
        });
      });
    });
    return chain.then(function () {
      return list.length ? U.reload() : null;
    });
  }

  var paintAt = 0;
  function paint(force) {
    if (!S.up) return;
    if (!force && S.up.items.length > 50) {
      var n = Date.now();
      if (n - paintAt < 250) return;
      paintAt = n;
    }
    U.renderUpload();
  }

  function run() {
    var up = S.up,
      chain = Promise.resolve();
    up.running = true;
    up.fatal = '';
    U.render();
    ensureTopics(up.job.topicsToCreate)
      .then(function () {
        up.items.forEach(function (it) {
          if (it.status !== 'pending') return;
          chain = chain.then(function () {
            it.status = 'saving';
            paint();
            return process(it)
              .catch(function (e) {
                fail(it, T('網路中斷或逾時，可按「重試失敗項」（不會重複建立）：{1}', e.message));
              })
              .then(function () {
                return persistItem(it);
              })
              .then(paint);
          });
        });
        return chain;
      })
      .catch(function (e) {
        up.fatal = T('{1}（進度已保留，可稍後繼續）', e.message);
      })
      .then(function () {
        up.running = false;
        var open = up.items.some(function (it) {
          return it.status === 'pending' || (it.status === 'error' && !it.fatal);
        });
        return (
          open
            ? Promise.resolve()
            : Jobs.delPrefix('item:' + up.job.id + ':').then(function () {
                return Jobs.delPrefix('job');
              })
        ).then(function () {
          return U.reload();
        });
      })
      .then(function () {
        if (S.up === up) paint(true);
      });
  }
  function retry() {
    S.up.items.forEach(function (it) {
      if (it.status === 'error' && !it.fatal) it.status = 'pending';
    });
    run();
  }
  function resume() {
    var up = S.up,
      j = up.resumable;
    Jobs.all('item:' + j.id + ':').then(function (recs) {
      up.items = recs.map(function (r) {
        return r.item;
      });
      up.items.forEach(function (it) {
        if (it.status === 'saving' || (it.status === 'error' && !it.fatal)) it.status = 'pending';
      });
      up.job = j;
      up.resumable = null;
      run();
    });
  }
  function discard() {
    var up = S.up,
      j = up.resumable;
    Jobs.delPrefix('item:' + j.id + ':')
      .then(function () {
        return Jobs.delPrefix('job');
      })
      .then(function () {
        up.resumable = null;
        paint(true);
      });
  }

  /* ───── 讀取使用者選的檔案 ───── */
  function readAll(files) {
    return Promise.all(
      files.map(function (f) {
        return U.readFile(f.file).then(
          function (t) {
            f.text = t;
            return f;
          },
          function () {
            f.text = null;
            return f;
          }
        );
      })
    ).then(function (fs) {
      return fs.filter(function (f) {
        return f.text !== null;
      });
    });
  }

  function chooseFiles(fileList) {
    var up = S.up,
      ignored = [],
      keep = [];
    Array.prototype.slice.call(fileList).forEach(function (f) {
      if (TEXT_RE.test(f.name) || SVG_RE.test(f.name))
        keep.push({ file: f, name: f.name, topicId: up.topic });
      else ignored.push(f.name);
    });
    readAll(keep).then(function (list) {
      startJob(list, [], ignored);
    });
  }

  function chooseFolder(fileList) {
    var up = S.up,
      all = Array.prototype.slice.call(fileList).map(function (f) {
        return { file: f, path: f.webkitRelativePath || f.name };
      });
    var map = L.mapFolders(all),
      ignored = [],
      keep = [];
    all.forEach(function (e, i) {
      var m = map[i],
        name = e.path.split('/').pop();
      if (m.skip) return;
      if (TEXT_RE.test(name) || SVG_RE.test(name))
        keep.push({ file: e.file, name: name, path: e.path, topicTitle: m.topicTitle, source: m.source });
      else ignored.push(name);
    });
    readAll(keep).then(function (list) {
      var used = {};
      S.topics.forEach(function (t) {
        used[t.id] = true;
      });
      var groups = {},
        order = [];
      list
        .filter(function (e) {
          return TEXT_RE.test(e.name);
        })
        .forEach(function (e) {
          var g = groups[e.topicTitle];
          if (!g) {
            g = groups[e.topicTitle] = { title: e.topicTitle, count: 0, id: '', isNew: false };
            if (e.topicTitle) {
              var ex = L.matchTopic(e.topicTitle, S.topics);
              if (ex) g.id = ex.id;
              else {
                g.id = L.newTopicId(used);
                used[g.id] = true;
                g.isNew = true;
              }
            }
            order.push(g);
          }
          g.count++;
        });
      list.forEach(function (e) {
        e.topicId = e.topicTitle && groups[e.topicTitle] ? groups[e.topicTitle].id : '';
      });
      up.preview = {
        groups: order,
        list: list,
        ignored: ignored,
        svgCount: list.filter(function (e) {
          return SVG_RE.test(e.name);
        }).length
      };
      paint(true);
    });
  }
  function confirmFolder() {
    var pv = S.up.preview;
    startJob(
      pv.list,
      pv.groups
        .filter(function (g) {
          return g.isNew;
        })
        .map(function (g) {
          return { id: g.id, title: g.title };
        }),
      pv.ignored
    );
  }

  /* ───── 畫面 ───── */
  function summary(items) {
    var c = {},
      added = [],
      stripped = [],
      unresolved = {},
      warns = [],
      resolved = 0,
      rewritten = 0;
    items.forEach(function (it) {
      c[it.status] = (c[it.status] || 0) + 1;
      if (it.kind !== 'md') {
        if (it.warn) warns.push(T('{1}：{2}', it.name, it.warn));
        return;
      }
      if (it.added && it.added.length) added.push(T('{1}：補了 {2}', it.path, it.added.join(T('、'))));
      if (it.strippedPublic) stripped.push(it.path);
      resolved += it.resolved || 0;
      rewritten += it.rewritten || 0;
      (it.unresolved || []).forEach(function (u) {
        unresolved[u] = true;
      });
      if (it.warn) warns.push(T('{1}：{2}', it.path, it.warn));
    });
    return {
      c: c,
      added: added,
      stripped: stripped,
      unresolved: Object.keys(unresolved),
      warns: warns,
      resolved: resolved,
      rewritten: rewritten
    };
  }
  function list(title, arr, limit) {
    if (!arr.length) return null;
    limit = limit || 30;
    var shown = arr.slice(0, limit);
    return el('section', {}, [
      el('h3', { text: T('{1}（{2}）', title, arr.length) }),
      el(
        'ul',
        { class: 'q' },
        shown
          .map(function (x) {
            return el('li', { text: x });
          })
          .concat(arr.length > limit ? [el('li', { text: T('…另有 {1} 項', arr.length - limit) })] : [])
      )
    ]);
  }

  U.renderUpload = function () {
    if (S.settings) return; // 設定疊在上面時，背景的非同步更新不要蓋掉設定畫面
    var up = S.up,
      main = U.$('main');
    main.textContent = '';
    main.appendChild(
      el('p', { class: 'back' }, [
        el('button', {
          type: 'button',
          class: 'linkbtn',
          text: T('← 回到列表'),
          onclick: function () {
            S.up = null;
            U.render();
          }
        })
      ])
    );
    main.appendChild(el('h2', { text: T('上傳') }));
    main.appendChild(
      el('p', {
        class: 'sub',
        text: T(
          '可選多個 .md、.svg 檔，或整個資料夾。缺少的標題、日期會補在 Drive 的副本上，不會改動你電腦上的原檔。原檔的 public 欄位會被清除，新主題一律是私人。'
        )
      })
    );

    if (up.resumable && !up.items.length) {
      Jobs.all('item:' + up.resumable.id + ':').then(function (recs) {
        var left = recs.filter(function (r) {
          return (
            r.item.status === 'pending' ||
            r.item.status === 'saving' ||
            (r.item.status === 'error' && !r.item.fatal)
          );
        }).length;
        var n = U.$('resume-n');
        if (n) n.textContent = T('{1} 個檔案待處理（共 {2} 個）', left, recs.length);
      });
      main.appendChild(
        el('section', { class: 'panel', role: 'alert' }, [
          el('h3', { text: T('上次有尚未完成的匯入') }),
          el('p', { class: 'sub', id: 'resume-n', text: T('讀取中…') }),
          el('div', { class: 'row' }, [
            el('button', {
              type: 'button',
              class: 'primary',
              id: 'u-resume',
              text: T('繼續匯入'),
              onclick: resume
            }),
            el('button', { type: 'button', class: 'linkbtn', text: T('放棄這次匯入'), onclick: discard })
          ])
        ])
      );
    }

    if (up.preview) {
      var pv = up.preview;
      main.appendChild(
        el('section', { class: 'panel' }, [
          el('h3', { text: T('匯入預覽（尚未寫入任何資料）') }),
          el(
            'ul',
            { class: 'q' },
            pv.groups
              .map(function (g) {
                return el('li', {
                  text: T(
                    '{1}　{2} 則',
                    g.title
                      ? T('「{1}」→ {2}', g.title, g.isNew ? T('新增私人主題') : T('既有主題'))
                      : T('未歸類'),
                    g.count
                  )
                });
              })
              .concat([
                el('li', {
                  text: T(
                    'SVG {1} 個；不支援而略過的檔案 {2} 個（例如點陣圖不處理）',
                    pv.svgCount,
                    pv.ignored.length
                  )
                })
              ])
          ),
          el('div', { class: 'row' }, [
            el('button', {
              type: 'button',
              class: 'primary',
              id: 'u-go',
              text: T('開始匯入'),
              onclick: confirmFolder
            }),
            el('button', {
              type: 'button',
              class: 'linkbtn',
              text: T('取消'),
              onclick: function () {
                up.preview = null;
                paint(true);
              }
            })
          ])
        ])
      );
    }

    var busy = up.running || !!up.preview;
    var topic = el(
      'select',
      { id: 'u-topic', 'aria-label': T('匯入到主題') },
      [el('option', { value: '', text: T('未歸類') })].concat(
        S.topics.map(function (t) {
          return el('option', { value: t.id, text: t.title });
        })
      )
    );
    topic.value = up.topic;
    topic.disabled = busy;
    topic.addEventListener('change', function () {
      up.topic = topic.value;
    });
    var files = el('input', {
      type: 'file',
      multiple: 'multiple',
      id: 'u-files',
      accept: '.md,.markdown,.svg,text/plain,text/markdown,image/svg+xml'
    });
    var folder = el('input', {
      type: 'file',
      multiple: 'multiple',
      id: 'u-folder',
      webkitdirectory: 'webkitdirectory'
    });
    files.disabled = folder.disabled = busy;
    files.addEventListener('change', function () {
      if (files.files && files.files.length) chooseFiles(files.files);
    });
    folder.addEventListener('change', function () {
      if (folder.files && folder.files.length) chooseFolder(folder.files);
    });
    main.appendChild(el('label', { class: 'fld' }, [el('span', { text: T('選檔上傳到主題') }), topic]));
    main.appendChild(el('label', { class: 'fld' }, [el('span', { text: T('選擇檔案（可多選）') }), files]));
    main.appendChild(
      el('label', { class: 'fld' }, [
        el('span', { text: T('或選擇整個資料夾（子資料夾會成為主題）') }),
        folder
      ])
    );
    if (up.fatal) main.appendChild(el('p', { class: 'err', role: 'alert', text: up.fatal }));
    if (!up.items.length) return;

    var sm = summary(up.items),
      n = up.items.length;
    var done = n - (sm.c.pending || 0) - (sm.c.saving || 0);
    main.appendChild(
      el('p', {
        class: 'status',
        role: 'status',
        'aria-live': 'polite',
        text: up.running
          ? T('處理中：{1} / {2}', done, n)
          : T(
              '處理完畢：成功 {1}、略過 {2}、需處理 {3}、失敗 {4}；連結轉換 {5} 處、SVG 引用改寫 {6} 處{7}',
              sm.c.ok || 0,
              sm.c.same || 0,
              sm.c.differs || 0,
              sm.c.error || 0,
              sm.resolved,
              sm.rewritten,
              up.job && up.job.ignored ? T('；不支援而略過 {1} 個檔案', up.job.ignored) : ''
            )
      })
    );
    var important = up.items.filter(function (it) {
      return it.status === 'error' || it.status === 'differs' || it.status === 'saving';
    });
    var recent = up.items
      .filter(function (it) {
        return it.status === 'ok' || it.status === 'same';
      })
      .slice(-8);
    var shown = n <= 60 ? up.items : important.concat(recent);
    main.appendChild(
      el(
        'ul',
        { class: 'q' },
        shown.map(function (it) {
          return el('li', {}, [
            el('span', { class: 'st ' + it.status, text: LABEL(it.status) }),
            ' ' + (it.path || it.name) + (it.msg ? T('　{1}', it.msg) : '')
          ]);
        })
      )
    );
    if (n > 60)
      main.appendChild(
        el('p', { class: 'sub', text: T('共 {1} 個項目，只列出需要注意的與最近完成的。', n) })
      );
    if (!up.running) {
      if (
        up.items.some(function (it) {
          return it.status === 'error' && !it.fatal;
        })
      )
        main.appendChild(
          el('p', {}, [
            el('button', {
              type: 'button',
              class: 'primary',
              id: 'u-retry',
              text: T('重試失敗項'),
              onclick: retry
            })
          ])
        );
      if (
        up.items.some(function (it) {
          return it.status === 'pending';
        })
      )
        main.appendChild(
          el('p', {}, [el('button', { type: 'button', class: 'primary', text: T('繼續處理'), onclick: run })])
        );
      [
        list(T('原本標示為公開、已清除（請自行決定是否公開）'), sm.stripped),
        list(T('補上的欄位（只列前 10 筆）'), sm.added, 10),
        list(T('無法轉換的 [[連結]]（保留原樣，請手動處理）'), sm.unresolved),
        list(T('提醒'), sm.warns),
        up.job && up.job.ignoredSample && up.job.ignoredSample.length
          ? list(T('不支援而略過的檔案（最多列 10 個）'), up.job.ignoredSample)
          : null
      ].forEach(function (s) {
        if (s) main.appendChild(s);
      });
      Jobs.persistent().then(function (ok) {
        if (!ok && S.up === up && up.items.length && !U.$('st-warn'))
          main.appendChild(
            el('p', { class: 'sub', id: 'st-warn', text: T('此環境無法保存匯入進度；關閉頁面後無法續傳。') })
          );
      });
    }
  };
})();
