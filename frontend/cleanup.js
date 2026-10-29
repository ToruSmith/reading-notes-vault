/**
 * cleanup.js — 設定頁的「清理未使用檔案」（P16）
 * 流程：掃描（只讀）→ 列清單、預設全選 → 使用者按「移到垃圾桶」。
 * 「未使用」的判斷全在後端（Core.gs 的 scanAssets_／trashAssets_）：看所有畫布，且建立超過 7 天。
 */
(function () {
  'use strict';
  var U = window.VaultUI,
    el = U.el;

  function kb(n) {
    return n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
  }

  U.cleanupSection = function () {
    var info = el('p', { class: 'sub', id: 's-cinfo', text: '' });
    var list = el('div', { id: 's-clist', class: 'cleanlist' });
    var checks = [];
    var go = el('button', { type: 'button', id: 's-cgo', text: T('移到垃圾桶'), hidden: true });
    var scan = el('button', { type: 'button', id: 's-cscan', text: T('掃描') });

    function say(msg) {
      info.textContent = msg;
    }
    function picked() {
      return checks.filter(function (c) {
        return c.box.checked;
      });
    }
    function sync() {
      var n = picked().length;
      go.disabled = !n;
      go.textContent = T('移到垃圾桶（{1}）', n);
    }
    function show(r) {
      list.textContent = '';
      checks = [];
      if (!r.items.length) {
        go.hidden = true;
        say(
          T('沒有未使用的檔案。') +
            (r.recent ? ' ' + T('另有 {1} 個檔案建立不到 {2} 天，先不列入。', r.recent, r.graceDays) : '')
        );
        return;
      }
      var total = r.items.reduce(function (s, x) {
        return s + x.size;
      }, 0);
      say(
        T('找到 {1} 個沒有任何畫布使用的檔案（共 {2}）。', r.items.length, kb(total)) +
          (r.recent ? ' ' + T('另有 {1} 個檔案建立不到 {2} 天，先不列入。', r.recent, r.graceDays) : '')
      );
      r.items.forEach(function (x) {
        var box = el('input', { type: 'checkbox', checked: true, onchange: sync });
        checks.push({ box: box, name: x.name });
        list.appendChild(
          el('label', { class: 'cleanrow' }, [
            box,
            el('span', { text: (/\.html$/.test(x.name) ? 'HTML ' : T('圖片') + ' ') + x.name }),
            el('span', { class: 'sub', text: kb(x.size) + ' · ' + String(x.updatedAt).slice(0, 10) })
          ])
        );
      });
      go.hidden = false;
      sync();
    }

    scan.onclick = function () {
      scan.disabled = true;
      say(T('掃描中…'));
      U.api('scanAssets')
        .then(function (r) {
          if (!r.ok) return say(T(r.error));
          show(r);
        })
        .catch(function (e) {
          say(e.message);
        })
        .then(function () {
          scan.disabled = false;
        });
    };
    go.onclick = function () {
      var names = picked().map(function (c) {
        return c.name;
      });
      if (!names.length) return;
      go.disabled = true;
      U.api('trashAssets', { names: names })
        .then(function (r) {
          if (!r.ok) return say(T(r.error));
          list.textContent = '';
          go.hidden = true;
          say(T('已移到垃圾桶 {1} 個；30 天內可在 Google Drive 的垃圾桶救回。', r.trashed));
        })
        .catch(function (e) {
          say(e.message);
          go.disabled = false;
        });
    };

    return el('section', { class: 'spanel' }, [
      el('h3', { text: T('清理未使用檔案') }),
      el('p', {
        class: 'sub',
        text: T(
          '找出沒有被任何畫布使用的圖片與 HTML 檔，確認後移到垃圾桶（可救回）。剛建立 7 天內的檔案不會列出。'
        )
      }),
      scan,
      info,
      list,
      go
    ]);
  };
})();
