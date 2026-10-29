/**
 * sync.js — 備份與網站同步（P5，擁有者專用）
 * 備份：存到 Drive 的 _backup 資料夾（可每月自動）；同步：把「訪客看得到的內容」推到 GitHub，由 Cloudflare Pages 建置靜態站。
 * token 只存在後端的指令碼屬性；這裡只看得到「有沒有設定」。
 */
(function () {
  'use strict';
  var U = window.VaultUI,
    S = U.S,
    el = U.el,
    api = U.api,
    $ = U.$;
  var Y = null; // 目前的頁面狀態；S.sync 指向它

  function fmtTime(iso) {
    try {
      return new Date(iso).toLocaleString();
    } catch (e) {
      return String(iso || '');
    }
  }
  function fmtSize(b) {
    return b >= 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB';
  }
  function reason(r) {
    return T.all(r.reasons || []).join(T('；')) || T(r.error || '無法完成');
  }

  function load() {
    return Promise.all([api('backupStatus'), api('siteStatus')])
      .then(function (rs) {
        if (S.sync !== Y) return;
        if (!rs[0].ok || !rs[1].ok) {
          Y.err = reason(rs[0].ok ? rs[1] : rs[0]);
        } else {
          Y.b = rs[0];
          Y.s = rs[1];
        }
        Y.loading = false;
        U.render();
      })
      .catch(function (e) {
        if (S.sync === Y) {
          Y.err = e.message;
          Y.loading = false;
          U.render();
        }
      });
  }
  U.openSync = function () {
    if (!S.me.isOwner) return;
    if (U.leaveCanvas && !U.leaveCanvas()) return;
    S.note = null;
    S.settings = false;
    S.topicEd = null;
    S.pub = null;
    Y = S.sync = {
      loading: true,
      err: '',
      b: null,
      s: null,
      busyB: false,
      busyS: false,
      progress: '',
      msg: '',
      sres: null
    };
    U.render();
    load();
  };
  function close() {
    S.sync = null;
    Y = null;
    U.render();
  }

  /* ───── 備份 ───── */
  function backupLoop(fresh, me) {
    return api('backupRun', { fresh: fresh })
      .then(function (r) {
        if (S.sync !== me) return;
        if (!r.ok) {
          me.err = reason(r);
          me.busyB = false;
          me.progress = '';
          return load();
        }
        var j = r.job || {};
        if (r.busy) {
          me.err = T('另一個備份正在進行中，請稍後再看狀態。');
          me.busyB = false;
          me.progress = '';
          return load();
        }
        if (j.stage === 'done') {
          me.busyB = false;
          me.progress = '';
          me.msg = T('備份完成並已核對：{1}', j.result ? j.result.name : '');
          return load();
        }
        if (j.stage === 'failed') {
          me.busyB = false;
          me.progress = '';
          me.err = T(j.error || '無法完成');
          return load();
        }
        me.progress = j.stage === 'read' ? T('讀取檔案 {1} / {2}', j.done, j.total) : T('準備中…');
        U.render();
        return backupLoop(false, me);
      })
      .catch(function (e) {
        if (S.sync === me) {
          me.busyB = false;
          me.progress = '';
          me.err = e.message;
          U.render();
        }
      });
  }
  function startBackup() {
    Y.busyB = true;
    Y.err = '';
    Y.msg = '';
    Y.progress = T('準備中…');
    U.render();
    backupLoop(true, Y);
  }
  function toggle(action, key) {
    var me = Y;
    me.err = '';
    me.msg = '';
    return api(action, { enable: !(key === 'monthly' ? me.b.monthly : me.s.daily) })
      .then(function (r) {
        if (S.sync !== me) return;
        if (!r.ok) {
          me.err = reason(r);
          return U.render();
        }
        return load();
      })
      .catch(function (e) {
        me.err = e.message;
        U.render();
      });
  }

  /* ───── 同步 ───── */
  function syncNow(dry) {
    var me = Y;
    me.busyS = true;
    me.err = '';
    me.msg = '';
    me.sres = null;
    U.render();
    return api('syncSite', dry ? { dryRun: true } : {})
      .then(function (r) {
        if (S.sync !== me) return;
        me.busyS = false;
        if (!r.ok) me.err = reason(r);
        else me.sres = r;
        return dry ? U.render() : load();
      })
      .catch(function (e) {
        me.busyS = false;
        me.err = e.message;
        U.render();
      });
  }
  function sumText(x) {
    return T('新增 {1}、更新 {2}、刪除 {3}、不變 {4}', x.added, x.updated, x.removed, x.unchanged);
  }

  U.renderSync = function () {
    var main = $('main');
    main.textContent = '';
    if (!Y) return;
    main.appendChild(
      el('p', { class: 'back' }, [
        el('button', {
          type: 'button',
          class: 'linkbtn',
          id: 'sy-back',
          text: T('← 回到列表'),
          onclick: close
        })
      ])
    );
    main.appendChild(el('h2', { text: T('同步與備份') }));
    if (Y.loading) {
      main.appendChild(el('p', { class: 'sub', role: 'status', text: T('讀取中…') }));
      return;
    }
    if (Y.err) main.appendChild(el('p', { class: 'err', role: 'alert', id: 'sy-err', text: Y.err }));
    if (Y.msg) main.appendChild(el('p', { class: 'sub', role: 'status', id: 'sy-msg', text: Y.msg }));
    if (!Y.b || !Y.s) return;
    var b = Y.b,
      s = Y.s;

    /* 備份 */
    var pb = el('section', { class: 'panel', id: 'sy-backup' }, [
      el('h3', { text: T('自動備份（存到你的 Drive）') })
    ]);
    pb.appendChild(
      el('p', {
        class: 'sub',
        text: T(
          '備份檔是完整的 ZIP（筆記、圖、主題、畫布），放在 Drive 的 _backup 資料夾，只保留最近 {1} 份。要還原時下載 ZIP，到「備份」頁選擇「還原」。',
          b.keep
        )
      })
    );
    pb.appendChild(
      el('p', {
        id: 'sy-last',
        text: b.last
          ? T(
              '最近一次：{1}（{2}，筆記 {3}、圖 {4}、主題 {5}、畫布 {6}{7}）',
              fmtTime(b.last.at),
              fmtSize(b.last.size),
              b.last.counts.notes,
              b.last.counts.assets,
              b.last.counts.topics,
              b.last.counts.boards,
              b.last.verified ? T('，已核對') : ''
            )
          : T('還沒有備份過。')
      })
    );
    if (b.last && b.last.missing)
      pb.appendChild(
        el('p', {
          class: 'err',
          text:
            T('有 {1} 個檔案讀不到，沒有放進備份。', b.last.missing) +
            (b.last.missingList && b.last.missingList.length ? ' ' + b.last.missingList.join('; ') : '')
        })
      );
    pb.appendChild(
      el('div', { class: 'row' }, [
        el('button', {
          type: 'button',
          class: 'primary',
          id: 'sy-bnow',
          text: T('立即備份'),
          disabled: Y.busyB ? 'disabled' : false,
          onclick: startBackup
        }),
        el('button', {
          type: 'button',
          class: 'tbtn',
          id: 'sy-bmon',
          'aria-pressed': b.monthly ? 'true' : 'false',
          text: b.monthly ? T('每月自動備份：已啟用（按一下停用）') : T('每月自動備份：未啟用（按一下啟用）'),
          onclick: function () {
            toggle('backupTrigger', 'monthly');
          }
        })
      ])
    );
    if (Y.progress)
      pb.appendChild(el('p', { class: 'sub', role: 'status', id: 'sy-prog', text: Y.progress }));
    if (b.backups.length)
      pb.appendChild(
        el(
          'ul',
          { class: 'q', id: 'sy-blist' },
          b.backups.map(function (x) {
            return el('li', {}, [
              el('span', { class: 'st ok', text: fmtTime(x.at) }),
              document.createTextNode(' ' + T('{1}（{2}）', x.name, fmtSize(x.size)) + ' '),
              el('a', { href: x.url, target: '_blank', rel: 'noopener noreferrer', text: T('在 Drive 開啟') })
            ]);
          })
        )
      );
    main.appendChild(pb);

    /* 網站同步 */
    var ps = el('section', { class: 'panel', id: 'sy-site' }, [
      el('h3', { text: T('網站同步（GitHub → Cloudflare Pages）') })
    ]);
    ps.appendChild(
      el('p', {
        class: 'sub',
        text: T(
          '只會推送訪客看得到的 {1} 則公開筆記（以及它們用到的圖與畫布）；私人內容不會離開 Drive。沒有變動時不會產生新的提交。',
          s.publicNotes
        )
      })
    );
    ps.appendChild(
      el('ul', { class: 'q', id: 'sy-cfg' }, [
        el('li', {}, [
          el('span', {
            class: 'st ' + (s.configured.token ? 'ok' : 'err'),
            text: s.configured.token ? T('已設定') : T('未設定')
          }),
          document.createTextNode(' GITHUB_TOKEN')
        ]),
        el('li', {}, [
          el('span', {
            class: 'st ' + (s.configured.repo ? 'ok' : 'err'),
            text: s.configured.repo ? T('已設定') : T('未設定')
          }),
          document.createTextNode(' GITHUB_REPO' + (s.repo ? T('：{1}（{2}）', s.repo, s.branch) : ''))
        ])
      ])
    );
    if (!s.configured.ready)
      ps.appendChild(
        el('p', {
          class: 'sub',
          id: 'sy-help',
          text: T(
            '請到 Apps Script 的「專案設定 → 指令碼屬性」新增 GITHUB_TOKEN 與 GITHUB_REPO（格式 owner/repo，必須是私人 repo）。步驟見 P5 驗收文件。'
          )
        })
      );
    ps.appendChild(
      el('p', {
        id: 'sy-slast',
        text: s.last
          ? s.last.unchanged
            ? T('最近一次：{1}，沒有變動。', fmtTime(s.last.at))
            : T('最近一次：{1}（{2}）', fmtTime(s.last.at), sumText(s.last.summary))
          : T('還沒有同步過。')
      })
    );
    if (s.last && s.last.url)
      ps.appendChild(
        el('p', {}, [
          el('a', {
            href: s.last.url,
            target: '_blank',
            rel: 'noopener noreferrer',
            text: T('在 GitHub 查看這次提交')
          })
        ])
      );
    var dis = !s.configured.ready || Y.busyS ? 'disabled' : false;
    ps.appendChild(
      el('div', { class: 'row' }, [
        el('button', {
          type: 'button',
          class: 'tbtn',
          id: 'sy-dry',
          text: T('預覽變更'),
          disabled: dis,
          onclick: function () {
            syncNow(true);
          }
        }),
        el('button', {
          type: 'button',
          class: 'primary',
          id: 'sy-sync',
          text: Y.busyS ? T('同步中…') : T('立即同步'),
          disabled: dis,
          onclick: function () {
            syncNow(false);
          }
        }),
        el('button', {
          type: 'button',
          class: 'tbtn',
          id: 'sy-daily',
          'aria-pressed': s.daily ? 'true' : 'false',
          text: s.daily ? T('每日自動同步：已啟用（按一下停用）') : T('每日自動同步：未啟用（按一下啟用）'),
          disabled: s.configured.ready || s.daily ? false : 'disabled',
          onclick: function () {
            toggle('syncTrigger', 'daily');
          }
        })
      ])
    );
    if (Y.sres)
      ps.appendChild(
        el('p', {
          class: 'sub',
          role: 'status',
          id: 'sy-sres',
          text:
            (Y.sres.dryRun ? T('預覽：') : '') +
            (Y.sres.unchanged ? T('沒有變動。') : sumText(Y.sres.summary))
        })
      );
    main.appendChild(ps);
  };
})();
