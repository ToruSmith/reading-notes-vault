/**
 * publish.js — 發布檢查（P4，擁有者專用）
 * 用 previewPublic／previewNote／previewSvg（與訪客走同一段後端程式）看「訪客實際會看到什麼」，
 * 並對這些內文做個資掃描（電話、Email、身分證字號、地址）。只提醒，不阻擋；寧可多報，由你判斷。
 */
(function () {
  'use strict';
  var U = window.VaultUI,
    L = VaultLogic,
    S = U.S,
    el = U.el,
    api = U.api,
    $ = U.$,
    Pii = VaultPii;
  var CONC = 4;
  var P = null; // 發布檢查的狀態；S.pub 指向它

  function open() {
    if (!S.me.isOwner) return;
    if (U.leaveCanvas && !U.leaveCanvas()) return;
    S.note = null;
    S.settings = false;
    S.topicEd = null;
    S.sync = null;
    P = S.pub = {
      loading: true,
      items: [],
      topics: [],
      scan: null,
      onlyWarn: false,
      open: {},
      prev: null,
      err: '',
      msg: ''
    };
    U.render();
    api('previewPublic')
      .then(function (r) {
        if (S.pub !== P) return;
        if (!r.ok) {
          P.err = T(r.error || '無法完成');
          P.loading = false;
          return U.render();
        }
        P.items = r.items;
        P.topics = r.topics;
        P.loading = false;
        byIdOf();
        U.render();
      })
      .catch(function (e) {
        if (S.pub === P) {
          P.err = e.message;
          P.loading = false;
          U.render();
        }
      });
  }
  U.openPublish = open;

  function byIdOf() {
    P.byId = {};
    P.items.forEach(function (x) {
      P.byId[x.id] = x;
    });
  }

  function close() {
    S.pub = null;
    P = null;
    U.render();
  }

  function runScan() {
    var ids = P.items.map(function (it) {
        return it.id;
      }),
      res = {},
      done = 0,
      me = P;
    P.scan = { running: true, done: 0, total: ids.length, res: res, failed: 0 };
    U.render();
    var idx = 0;
    function worker() {
      if (idx >= ids.length || S.pub !== me) return Promise.resolve();
      var id = ids[idx++],
        it = S.byId[id] || {};
      return api('previewNote', { id: id })
        .then(function (r) {
          if (r.ok)
            res[id] = Pii.scan((r.meta && r.meta.title ? r.meta.title : it.title || '') + '\n' + r.body);
          else me.scan.failed++;
        })
        .catch(function () {
          me.scan.failed++;
        })
        .then(function () {
          me.scan.done = ++done;
          if (done % 5 === 0 || done === ids.length) U.render();
          return worker();
        });
    }
    var ws = [];
    for (var i = 0; i < CONC; i++) ws.push(worker());
    return Promise.all(ws).then(function () {
      if (S.pub === me) {
        me.scan.running = false;
        U.render();
      }
    });
  }

  function setPrivate(id) {
    P.err = '';
    P.msg = '';
    return api('updateNotes', { ids: [id], public: false })
      .then(function (r) {
        if (!r.ok || (r.failed && r.failed.length)) {
          P.err = T(r.error || (r.failed && r.failed[0] && r.failed[0].reason) || '無法完成');
          return U.render();
        }
        return U.reload().then(function () {
          P.items = P.items.filter(function (x) {
            return x.id !== id;
          });
          if (P.scan) delete P.scan.res[id];
          if (P.prev === id) P.prev = null;
          // 若這則因為「主題預設公開」仍然公開，重新取一次訪客清單才準
          return api('previewPublic').then(function (q) {
            if (q.ok) {
              P.items = q.items;
              P.topics = q.topics;
              byIdOf();
            }
            P.msg = T('已設為私人。');
            U.render();
          });
        });
      })
      .catch(function (e) {
        P.err = e.message;
        U.render();
      });
  }

  function previewBox(id) {
    var box = el('div', { class: 'panel md vprev', id: 'vprev' }, [
      el('p', { class: 'sub', text: T('讀取中…') })
    ]);
    api('previewNote', { id: id })
      .then(function (r) {
        if (P.prev !== id) return;
        box.textContent = '';
        if (!r.ok) {
          box.appendChild(el('p', { class: 'err', text: T('找不到這則筆記。') }));
          return;
        }
        box.appendChild(el('p', { class: 'vbanner', text: T('這是訪客看到的樣子。') }));
        box.appendChild(el('h3', { text: r.meta.title }));
        var body = el('div', { class: 'md' });
        body.innerHTML = U.mdHtml(r.body, P.byId || S.byId);
        box.appendChild(body);
        U.loadSvgs(box, 'previewSvg');
      })
      .catch(function (e) {
        box.textContent = e.message;
      });
    return box;
  }

  U.renderPublish = function () {
    var main = $('main');
    main.textContent = '';
    if (!P) return;
    main.appendChild(
      el('p', { class: 'back' }, [
        el('button', {
          type: 'button',
          class: 'linkbtn',
          id: 'pub-back',
          text: T('← 回到列表'),
          onclick: close
        })
      ])
    );
    main.appendChild(el('h2', { text: T('發布檢查') }));
    main.appendChild(
      el('p', {
        class: 'sub',
        text: T(
          '這裡用訪客的角度看你的 Vault：哪些內容公開、內文裡有沒有電話、Email 等個人資料。掃描只提醒，不會擋你發布。'
        )
      })
    );
    if (P.loading) {
      main.appendChild(el('p', { class: 'sub', role: 'status', text: T('讀取中…') }));
      return;
    }
    if (P.err) main.appendChild(el('p', { class: 'err', role: 'alert', id: 'pub-err', text: P.err }));
    if (P.msg) main.appendChild(el('p', { class: 'sub', role: 'status', id: 'pub-msg', text: P.msg }));
    var explicit = 0,
      byTopic = 0;
    P.items.forEach(function (p) {
      var o = S.byId[p.id];
      if (o && o.public === true) explicit++;
      else byTopic++;
    });
    main.appendChild(
      el('div', { class: 'panel', id: 'pub-sum' }, [
        el('p', {
          text: T(
            '共 {1} 則筆記，訪客看得到 {2} 則；公開主題 {3} 個。',
            S.items.length,
            P.items.length,
            P.topics.length
          )
        }),
        el('p', {
          class: 'sub',
          text: T('其中 {1} 則是單獨設為公開，{2} 則因為所在主題預設公開。', explicit, byTopic)
        })
      ])
    );
    var sc = P.scan;
    var scanBtn = el('button', {
      type: 'button',
      class: 'primary',
      id: 'pub-scan',
      text: sc && !sc.running ? T('重新掃描個資') : T('掃描個資'),
      disabled: (sc && sc.running) || !P.items.length ? 'disabled' : false,
      onclick: runScan
    });
    var row = [scanBtn];
    if (sc)
      row.push(
        el('label', { class: 'chk' }, [
          el('input', {
            type: 'checkbox',
            id: 'pub-only',
            checked: P.onlyWarn ? 'checked' : false,
            onchange: function (e) {
              P.onlyWarn = e.target.checked;
              U.render();
            }
          }),
          el('span', { text: T('只顯示有警告的') })
        ])
      );
    main.appendChild(el('div', { class: 'row' }, row));
    if (sc) {
      var warn = Object.keys(sc.res).filter(function (id) {
        return sc.res[id].length;
      }).length;
      main.appendChild(
        el('p', {
          class: 'sub',
          role: 'status',
          id: 'pub-prog',
          text: sc.running
            ? T('掃描中：{1} / {2}', sc.done, sc.total)
            : T('掃描完成：{1} 則筆記有可能的個資（共掃描 {2} 則）。', warn, sc.total - sc.failed) +
              (sc.failed ? T('有 {1} 則讀取失敗。', sc.failed) : '')
        })
      );
    }
    var ul = el('ul', { class: 'list', id: 'pub-list' });
    P.items.forEach(function (p) {
      var f = sc && sc.res[p.id],
        n = f ? f.length : 0;
      if (P.onlyWarn && sc && !n) return;
      var sm = f ? Pii.summarize(f) : {};
      var head = el('div', { class: 't' }, [el('strong', { text: p.title })]);
      Object.keys(sm).forEach(function (k) {
        head.appendChild(el('span', { class: 'pii-badge', text: T(Pii.TYPES[k]) + ' ×' + sm[k] }));
      });
      var li = el('li', { class: 'pubrow', 'data-id': p.id }, [head]);
      var acts = el('div', { class: 'acts' }, [
        el('button', {
          type: 'button',
          class: 'tbtn',
          'data-act': 'prev',
          text: P.prev === p.id ? T('收起預覽') : T('訪客視角預覽'),
          onclick: function () {
            P.prev = P.prev === p.id ? null : p.id;
            U.render();
          }
        }),
        el('button', {
          type: 'button',
          class: 'tbtn',
          'data-act': 'priv',
          text: T('設為私人'),
          onclick: function () {
            setPrivate(p.id);
          }
        }),
        el('button', {
          type: 'button',
          class: 'tbtn',
          'data-act': 'edit',
          text: T('在編輯器開啟'),
          onclick: function () {
            S.pub = null;
            P = null;
            U.openEditor(p.id);
          }
        })
      ]);
      if (n)
        acts.appendChild(
          el('button', {
            type: 'button',
            class: 'tbtn',
            'data-act': 'detail',
            text: P.open[p.id] ? T('收起明細') : T('看明細'),
            onclick: function () {
              P.open[p.id] = !P.open[p.id];
              U.render();
            }
          })
        );
      li.appendChild(acts);
      if (n && P.open[p.id])
        li.appendChild(
          el(
            'ul',
            { class: 'pii-list' },
            f.map(function (x) {
              var ctx = x.context,
                i = ctx.indexOf(x.text);
              var line =
                i < 0
                  ? [document.createTextNode(ctx)]
                  : [
                      document.createTextNode(ctx.slice(0, i)),
                      el('mark', { text: x.text }),
                      document.createTextNode(ctx.slice(i + x.text.length))
                    ];
              return el(
                'li',
                {},
                [
                  el('span', {
                    text:
                      T(Pii.TYPES[x.type]) +
                      T('（第 {1} 行）', x.line) +
                      (x.inCode ? T('・程式碼區塊') : '') +
                      T('：')
                  })
                ].concat(line)
              );
            })
          )
        );
      if (P.prev === p.id) li.appendChild(previewBox(p.id));
      ul.appendChild(li);
    });
    if (!ul.childNodes.length)
      main.appendChild(
        el('p', { class: 'sub', text: sc ? T('沒有符合的筆記。') : T('目前沒有任何公開的筆記。') })
      );
    else main.appendChild(ul);
  };
})();
