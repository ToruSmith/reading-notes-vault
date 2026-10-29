/**
 * topics.js — 主題（書櫃分類）的新增、編輯、刪除（P3.5）
 * 後端 saveTopic／deleteTopic 只有擁有者能呼叫；主題內還有筆記時不能刪；
 * 把私人主題改成公開、而其中有「沒明確設定 public」的筆記時，後端會要求確認，這裡照樣跳出確認。
 */
(function () {
  'use strict';
  var U = window.VaultUI,
    L = VaultLogic,
    S = U.S,
    el = U.el,
    api = U.api;
  var K = function (x) {
    return x;
  }; // 翻譯鍵標記（掃描工具靠它找出鍵）
  var E = null;

  function used() {
    var u = {};
    S.topics.forEach(function (t) {
      u[t.id] = 1;
    });
    return u;
  }
  function uniq(list) {
    var seen = {};
    return list.filter(function (x) {
      if (!x || seen[x]) return false;
      seen[x] = 1;
      return true;
    });
  }

  U.openTopicEditor = function (id) {
    if (U.leaveCanvas && !U.leaveCanvas()) return;
    var t = id ? S.tmap[id] : null;
    if (id && !t) return;
    S.note = null;
    S.edit = null;
    S.up = null;
    S.zip = null;
    S.settings = false;
    E = {
      id: id || '',
      isNew: !id,
      title: t ? t.title : '',
      category: t ? t.category || '' : S.f.topic && S.tmap[S.f.topic] ? S.tmap[S.f.topic].category || '' : '',
      status: t ? t.status || '' : '',
      pub: t ? t.defaultPublic === true : false,
      busy: false,
      err: '',
      confirm: null,
      confirmDel: false
    };
    S.topicEd = E;
    U.render();
    U.$('main').focus({ preventScroll: true });
    window.scrollTo(0, 0);
  };

  /** 主題頁的一鍵切換：直接改 defaultPublic。後端說有筆記會一併公開時，轉到編輯頁用既有的確認畫面，不在這裡自作主張。 */
  U.setTopicPublic = function (id, pub) {
    var t = S.tmap[id];
    if (!t || S.topicBusy) return;
    S.topicBusy = true;
    U.render();
    api('saveTopic', {
      id: id,
      title: t.title,
      category: t.category || '',
      status: t.status || '',
      defaultPublic: pub
    })
      .then(function (r) {
        S.topicBusy = false;
        if (r.ok)
          return U.reload().then(function () {
            U.flash = pub
              ? T('主題已改為公開。畫布與其中沒有明確設定 public 的筆記，訪客都看得到了。')
              : T('主題已改為私人。');
            U.render();
          });
        if (r.error === K('需要確認')) {
          U.openTopicEditor(id);
          E.pub = true;
          E.confirm = r;
          return U.render();
        }
        U.flash = T.all(r.reasons || [r.error || T('儲存失敗')]).join(T('；'));
        U.render();
      })
      .catch(function (e) {
        S.topicBusy = false;
        U.flash = e.message;
        U.render();
      });
  };

  function close(toTopic) {
    S.topicEd = null;
    E = null;
    if (toTopic !== undefined) S.f.topic = toTopic;
    U.render();
  }
  function save(confirmPublic) {
    var title = E.title.trim();
    if (!title) {
      E.err = T('請輸入標題');
      return U.render();
    }
    var id = E.isNew ? L.newTopicId(used()) : E.id;
    E.busy = true;
    E.err = '';
    E.confirm = null;
    U.render();
    var p = {
      id: id,
      title: title,
      category: E.category.trim(),
      status: E.status.trim(),
      defaultPublic: E.pub
    };
    if (confirmPublic) p.confirmPublic = true;
    api('saveTopic', p)
      .then(function (r) {
        E.busy = false;
        if (r.ok)
          return U.reload().then(function () {
            close(id);
          });
        if (r.error === K('需要確認')) {
          E.confirm = r;
          return U.render();
        }
        E.err = T.all(r.reasons || [r.error || T('儲存失敗')]).join(T('；'));
        U.render();
      })
      .catch(function (e) {
        E.busy = false;
        E.err = e.message;
        U.render();
      });
  }
  function del() {
    E.busy = true;
    E.err = '';
    U.render();
    api('deleteTopic', { id: E.id })
      .then(function (r) {
        E.busy = false;
        if (r.ok)
          return U.reload().then(function () {
            U.flash = '';
            close('');
          });
        E.err = T(r.error || '無法完成');
        E.confirmDel = false;
        U.render();
      })
      .catch(function (e) {
        E.busy = false;
        E.err = e.message;
        U.render();
      });
  }

  U.renderTopicEditor = function () {
    var main = U.$('main');
    main.textContent = '';
    var noteCount = E.isNew
      ? 0
      : S.items.filter(function (it) {
          return it.topic === E.id;
        }).length;
    main.appendChild(
      el('p', { class: 'back' }, [
        el('button', {
          type: 'button',
          class: 'linkbtn',
          id: 'te-back',
          text: T('← 回到列表'),
          onclick: function () {
            close();
          }
        })
      ])
    );
    main.appendChild(el('h2', { text: E.isNew ? T('新增主題') : T('編輯主題') }));
    function field(label, key, list) {
      var id = 'te-' + key,
        inp = el('input', {
          type: 'text',
          id: id,
          value: E[key],
          maxlength: key === 'title' ? '100' : '50',
          autocomplete: 'off',
          list: list ? 'te-dl-' + key : false
        });
      inp.addEventListener('input', function () {
        E[key] = inp.value;
      });
      var kids = [el('span', { text: label }), inp];
      if (list)
        kids.push(
          el(
            'datalist',
            { id: 'te-dl-' + key },
            uniq(list).map(function (v) {
              return el('option', { value: v });
            })
          )
        );
      return el('label', { class: 'fld' }, kids);
    }
    main.appendChild(field(T('主題名稱'), 'title'));
    main.appendChild(
      field(
        T('分類（書櫃的分組標題，可留空）'),
        'category',
        S.topics.map(function (t) {
          return t.category;
        })
      )
    );
    main.appendChild(
      field(
        T('狀態（例如 reading、done，可留空）'),
        'status',
        S.topics.map(function (t) {
          return t.status;
        })
      )
    );
    var chk = el('input', { type: 'checkbox', id: 'te-pub', checked: E.pub ? 'checked' : false });
    chk.addEventListener('change', function () {
      E.pub = chk.checked;
    });
    main.appendChild(
      el('label', { class: 'fld chk' }, [
        chk,
        el('span', { text: T('這個主題預設公開（其中沒有明確設定 public 的筆記，訪客都看得到）') })
      ])
    );
    if (E.err) main.appendChild(el('p', { class: 'err', role: 'alert', id: 'te-err', text: E.err }));
    if (E.confirm)
      main.appendChild(
        el('section', { class: 'panel', role: 'alertdialog' }, [
          el('h3', { text: T('需要確認') }),
          el('p', {
            text: T(
              '此主題有 {1} 則筆記沒有明確設定 public，改為公開後它們會一併公開。',
              E.confirm.affectedNotes
            )
          }),
          el('div', { class: 'row' }, [
            el('button', {
              type: 'button',
              class: 'tbtn danger',
              id: 'te-confirm',
              text: T('確認公開'),
              onclick: function () {
                save(true);
              }
            }),
            el('button', {
              type: 'button',
              class: 'tbtn',
              text: T('取消'),
              onclick: function () {
                E.confirm = null;
                U.render();
              }
            })
          ])
        ])
      );
    main.appendChild(
      el('div', { class: 'row' }, [
        el('button', {
          type: 'button',
          class: 'primary',
          id: 'te-save',
          text: E.busy ? T('處理中…') : T('儲存'),
          disabled: E.busy ? 'disabled' : false,
          onclick: function () {
            save(false);
          }
        })
      ])
    );
    if (!E.isNew) {
      var sec = el('section', { class: 'panel' }, [el('h3', { text: T('刪除主題') })]);
      if (noteCount > 0)
        sec.appendChild(
          el('p', {
            class: 'sub',
            id: 'te-nodel',
            text: T('這個主題還有 {1} 則筆記。請先把筆記移到別的主題，或刪除它們，才能刪除主題。', noteCount)
          })
        );
      else if (!E.confirmDel)
        sec.appendChild(
          el('button', {
            type: 'button',
            class: 'tbtn danger',
            id: 'te-del',
            text: T('刪除這個主題'),
            onclick: function () {
              E.confirmDel = true;
              U.render();
            }
          })
        );
      else
        sec.appendChild(
          el('div', {}, [
            el('p', { text: T('主題與它的畫布會移到 Google Drive 垃圾桶。確定嗎？') }),
            el('div', { class: 'row' }, [
              el('button', {
                type: 'button',
                class: 'tbtn danger',
                id: 'te-del-ok',
                text: T('確定刪除'),
                disabled: E.busy ? 'disabled' : false,
                onclick: del
              }),
              el('button', {
                type: 'button',
                class: 'tbtn',
                text: T('取消'),
                onclick: function () {
                  E.confirmDel = false;
                  U.render();
                }
              })
            ])
          ])
        );
      main.appendChild(sec);
    }
  };
})();
