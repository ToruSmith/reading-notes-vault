/**
 * canvas_insp.js — 畫布右側的屬性欄：單選卡片、連線、多選時的設定與操作提示。
 * 只透過 VaultUI.cv 操作畫布。
 */
(function () {
  'use strict';
  var U = window.VaultUI,
    K = U.cv,
    CL = window.CanvasLogic,
    el = U.el;
  /** 文字卡 → 筆記：先建立筆記（立即存到雲端），再把卡片換成筆記卡；卡片 id 不變，所以連線與群組歸屬都保留。 */
  function toNote(n) {
    var C = K.C(),
      L = window.VaultLogic,
      title = L.titleFromText(n.text) || T('未命名筆記'),
      topic = C.topic,
      btn = U.$('cv-tonote');
    if (btn) btn.disabled = true;
    K.setStatus(T('建立筆記中…'));
    U.createNote({ title: title, topic: topic }, String(n.text || ''))
      .then(function (id) {
        var C2 = K.C();
        if (!C2 || C2.topic !== topic || !K.nodeMap()[n.id]) return;
        K.updateNode(n.id, {
          type: 'file',
          file: 'notes/' + id + '.md',
          text: undefined,
          'x-fontsize': undefined
        });
        K.setStatus(T('已轉成筆記「{1}」。記得按「儲存」畫布。', title));
      })
      .catch(function (e) {
        K.setStatus(T('轉成筆記失敗：{1}', e.message));
        if (btn) btn.disabled = false;
      });
  }
  function colorName(k) {
    return { 1: T('紅'), 2: T('橙'), 3: T('黃'), 4: T('綠'), 5: T('青'), 6: T('紫') }[k];
  }
  var f = function (n) {
    return function () {
      return K[n].apply(null, arguments);
    };
  };
  var deleteSel = f('deleteSel'),
    draw = f('draw'),
    fetchPreviewFor = f('fetchPreviewFor'),
    markDirty = f('markDirty'),
    nodeMap = f('nodeMap'),
    noteIdOf = f('noteIdOf'),
    openNoteFromCanvas = f('openNoteFromCanvas'),
    setStatus = f('setStatus'),
    snap = f('snap'),
    updateEdge = f('updateEdge'),
    updateNode = f('updateNode');

  function swatches(cur, onPick) {
    var row = el('div', { class: 'cv-sw', role: 'group', 'aria-label': T('顏色') });
    row.appendChild(
      el('button', {
        type: 'button',
        class: 'cv-s none' + (!cur ? ' on' : ''),
        title: T('無色'),
        'aria-label': T('無色'),
        text: '∅',
        onclick: function () {
          onPick(undefined);
        }
      })
    );
    Object.keys(CL.PRESET).forEach(function (k) {
      var b = el('button', {
        type: 'button',
        class: 'cv-s' + (cur === k ? ' on' : ''),
        title: colorName(k),
        'aria-label': colorName(k),
        onclick: function () {
          onPick(k);
        }
      });
      b.style.background = CL.PRESET[k];
      row.appendChild(b);
    });
    return row;
  }
  function fld(label, input) {
    return el('label', { class: 'fld' }, [el('span', { text: label }), input]);
  }
  function syncInspector() {
    var C = K.C(),
      box = C && C.dom && C.dom.insp;
    if (!box) return;
    box.textContent = '';
    C.typing = false;
    var ids = Object.keys(C.sel);
    if (C.selEdge) {
      var e = C.board.edges.filter(function (x) {
        return x.id === C.selEdge;
      })[0];
      if (!e) {
        C.selEdge = null;
        return syncInspector();
      }
      var lab = el('input', {
        class: 'in',
        value: e.label || '',
        'aria-label': T('連線名稱'),
        maxlength: '60'
      });
      lab.addEventListener('input', function () {
        updateEdge2(e.id, { label: lab.value || undefined });
      });
      lab.addEventListener('blur', function () {
        C.typing = false;
      });
      var dir = el(
        'select',
        { class: 'in', 'aria-label': T('方向') },
        [
          [T('→ 單向箭頭'), 'to'],
          [T('← 反向箭頭'), 'from'],
          [T('↔ 雙向箭頭'), 'both'],
          [T('— 無箭頭'), 'none']
        ].map(function (o) {
          return el('option', { value: o[1], text: o[0] });
        })
      );
      var ends = CL.edgeEnds(e);
      dir.value =
        ends.to === 'arrow' && ends.from === 'arrow'
          ? 'both'
          : ends.to === 'arrow'
            ? 'to'
            : ends.from === 'arrow'
              ? 'from'
              : 'none';
      dir.addEventListener('change', function () {
        var v = dir.value;
        updateEdge(e.id, {
          fromEnd: v === 'from' || v === 'both' ? 'arrow' : 'none',
          toEnd: v === 'to' || v === 'both' ? 'arrow' : 'none'
        });
      });
      var sty = el('select', { class: 'in', 'aria-label': T('線型') }, [
        el('option', { value: 'solid', text: T('實線') }),
        el('option', { value: 'dashed', text: T('虛線') })
      ]);
      sty.value = e['x-style'] === 'dashed' ? 'dashed' : 'solid';
      sty.addEventListener('change', function () {
        updateEdge(e.id, { 'x-style': sty.value === 'dashed' ? 'dashed' : undefined });
      });
      var lsz = el(
        'select',
        { class: 'in', id: 'cv-labelsize', 'aria-label': T('文字大小') },
        [
          ['s', T('小')],
          ['m', T('中（預設）')],
          ['l', T('大')]
        ].map(function (o) {
          return el('option', { value: o[0], text: o[1] });
        })
      );
      lsz.value = CL.labelSizeOf(e);
      lsz.addEventListener('change', function () {
        updateEdge(e.id, { 'x-labelsize': lsz.value === 'm' ? undefined : lsz.value });
      });
      var lps = el(
        'select',
        { class: 'in', id: 'cv-labelpos', 'aria-label': T('文字位置') },
        [
          ['start', T('靠起點')],
          ['mid', T('置中（預設）')],
          ['end', T('靠終點')]
        ].map(function (o) {
          return el('option', { value: o[0], text: o[1] });
        })
      );
      lps.value = CL.labelPosOf(e);
      lps.addEventListener('change', function () {
        updateEdge(e.id, { 'x-labelpos': lps.value === 'mid' ? undefined : lps.value });
      });
      box.appendChild(el('h3', { text: T('連線') }));
      box.appendChild(fld(T('名稱'), lab));
      box.appendChild(fld(T('文字大小'), lsz));
      box.appendChild(fld(T('文字位置'), lps));
      box.appendChild(fld(T('方向'), dir));
      box.appendChild(fld(T('線型'), sty));
      box.appendChild(
        el('div', { class: 'fld' }, [
          el('span', { text: T('顏色') }),
          swatches(e.color, function (c) {
            updateEdge(e.id, { color: c });
            syncInspector();
          })
        ])
      );
      box.appendChild(
        el('p', {}, [
          el('button', { type: 'button', class: 'tbtn', text: T('刪除連線'), onclick: deleteSel })
        ])
      );
      return;
    }
    if (ids.length === 1) {
      var n = nodeMap()[ids[0]];
      if (!n) {
        C.sel = {};
        return syncInspector();
      }
      box.appendChild(
        el('h3', {
          text:
            { text: T('文字卡片'), file: T('筆記卡片'), link: T('連結卡片'), group: T('群組') }[n.type] ||
            T('卡片')
        })
      );
      if (n.type === 'text') {
        var ta = el('textarea', {
          class: 'in cv-ta',
          rows: '8',
          'aria-label': T('卡片文字（支援 Markdown）')
        });
        ta.value = n.text || '';
        ta.addEventListener('input', function () {
          updateNode(n.id, { text: ta.value }, true);
        });
        ta.addEventListener('blur', function () {
          C.typing = false;
        });
        box.appendChild(fld(T('內容（Markdown）'), ta));
        C.dom.ta = ta;
        var fsz = el(
          'select',
          { class: 'in', id: 'cv-fontsize', 'aria-label': T('文字大小') },
          [
            ['s', T('小')],
            ['m', T('中（預設）')],
            ['l', T('大')],
            ['xl', T('特大')]
          ].map(function (o) {
            return el('option', { value: o[0], text: o[1] });
          })
        );
        fsz.value = window.CanvasOps ? window.CanvasOps.fontSizeOf(n) : 'm';
        fsz.addEventListener('change', function () {
          updateNode(n.id, { 'x-fontsize': fsz.value === 'm' ? undefined : fsz.value });
        });
        box.appendChild(fld(T('文字大小'), fsz));
        if (U.createNote)
          box.appendChild(
            el('p', {}, [
              el('button', {
                type: 'button',
                class: 'tbtn',
                id: 'cv-tonote',
                title: T('把這張文字卡存成一則正式筆記（同主題），卡片換成筆記卡，連線保留'),
                text: T('轉成筆記'),
                onclick: function () {
                  toNote(n);
                }
              })
            ])
          );
      }
      if (n.type === 'group') {
        var gl = el('input', {
          class: 'in',
          value: n.label || '',
          'aria-label': T('群組名稱'),
          maxlength: '80'
        });
        gl.addEventListener('input', function () {
          updateNode(n.id, { label: gl.value }, true);
        });
        gl.addEventListener('blur', function () {
          C.typing = false;
        });
        box.appendChild(fld(T('名稱'), gl));
        C.dom.gl2 = gl;
        box.appendChild(
          el('p', {}, [
            el('button', {
              type: 'button',
              class: 'tbtn',
              id: 'cv-outline',
              title: T('把群組裡的卡片依位置排成 Markdown 清單，開成一則新筆記草稿（不會自動存檔）'),
              text: T('轉成大綱筆記'),
              onclick: function () {
                if (K.pres) K.pres.outline(n.id);
              }
            })
          ])
        );
      }
      if (n.type === 'link') {
        var ur = el('input', { class: 'in', value: n.url || '', 'aria-label': T('網址') });
        ur.addEventListener('change', function () {
          var u = CL.safeUrl(ur.value);
          if (!u) {
            setStatus(T('請輸入 http 或 https 開頭的網址。'));
            ur.value = n.url || '';
            return;
          }
          updateNode(n.id, { url: u });
        });
        box.appendChild(fld(T('網址'), ur));
        var pvn = CL.safePreview(n['x-preview']);
        box.appendChild(
          el('p', {
            class: 'sub',
            text: pvn ? T('預覽：{1}', pvn.title || pvn.description) : T('尚無網頁預覽')
          })
        );
        box.appendChild(
          el('p', {}, [
            el('button', {
              type: 'button',
              class: 'tbtn',
              id: 'cv-pv-get',
              text: pvn ? T('重新擷取預覽') : T('擷取預覽'),
              disabled: /^https:\/\//i.test(n.url || '') ? false : 'disabled',
              title: /^https:\/\//i.test(n.url || '') ? '' : T('只能擷取 https 網址'),
              onclick: function () {
                fetchPreviewFor(n.id, n.url);
              }
            }),
            pvn
              ? el('button', {
                  type: 'button',
                  class: 'tbtn',
                  text: T('移除預覽'),
                  onclick: function () {
                    updateNode(n.id, { 'x-preview': undefined });
                    syncInspector();
                  }
                })
              : null
          ])
        );
      }
      if (K.embed) K.embed.inspector(n, box); // 嵌入網頁／HTML 腳本開關（canvas_embed.js）
      if (n.type === 'file') {
        box.appendChild(el('p', { class: 'sub', text: n.file || '' }));
        if (noteIdOf(n))
          box.appendChild(
            el('p', {}, [
              el('button', {
                type: 'button',
                class: 'tbtn',
                text: T('開啟這則筆記'),
                onclick: function () {
                  openNoteFromCanvas(noteIdOf(n));
                }
              })
            ])
          );
      }
      box.appendChild(
        el('div', { class: 'fld' }, [
          el('span', { text: T('顏色') }),
          swatches(n.color, function (c) {
            updateNode(n.id, { color: c });
            syncInspector();
          })
        ])
      );
      box.appendChild(
        el('p', {}, [el('button', { type: 'button', class: 'tbtn', text: T('刪除'), onclick: deleteSel })])
      );
      return;
    }
    if (ids.length > 1) {
      box.appendChild(el('h3', { text: T('已選取 {1} 張', ids.length) }));
      box.appendChild(el('p', { class: 'sub', text: T('拖曳可一起移動；群組會帶著成員。') }));
      if (K.tools && K.tools.alignRow) box.appendChild(K.tools.alignRow(ids.length));
      box.appendChild(
        el('p', {}, [
          el('button', { type: 'button', class: 'tbtn', text: T('刪除選取'), onclick: deleteSel })
        ])
      );
      return;
    }
    box.appendChild(el('h3', { text: T('操作提示') }));
    box.appendChild(
      el(
        'ul',
        { class: 'cv-tips' },
        [
          T('拖曳空白處：平移；Ctrl＋滾輪或雙指：縮放'),
          T('新增卡片：用上方「＋文字」等按鈕；雙擊筆記卡：開啟筆記'),
          T('Shift＋拖曳：框選；拖卡片進出群組框即改變歸屬'),
          T('右下角方塊：調整大小；Delete：刪除；Ctrl＋Z／Y：復原／重做'),
          T('按「儲存」才會寫入雲端')
        ].map(function (t) {
          return el('li', { text: t });
        })
      )
    );
    box.appendChild(
      el('p', { class: 'sub', text: T('{1} 張卡片・{2} 條連線', C.board.nodes.length, C.board.edges.length) })
    );
  }
  function updateEdge2(id, patch) {
    var C = K.C();
    if (!C.typing) {
      C.hist.push(snap());
      C.typing = true;
    }
    C.board = Object.assign({}, C.board, {
      edges: C.board.edges.map(function (e) {
        if (e.id !== id) return e;
        var m = Object.assign({}, e);
        Object.keys(patch).forEach(function (k) {
          if (patch[k] === undefined) delete m[k];
          else m[k] = patch[k];
        });
        return m;
      })
    });
    markDirty();
    draw();
  }

  K.syncInspector = syncInspector;
})();
